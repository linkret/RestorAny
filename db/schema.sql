CREATE EXTENSION IF NOT EXISTS postgis;

CREATE TABLE IF NOT EXISTS korisnik (
    id SERIAL PRIMARY KEY,
    username VARCHAR(100) UNIQUE NOT NULL,
    email VARCHAR(255) UNIQUE NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    is_admin BOOLEAN DEFAULT FALSE
);

CREATE TABLE IF NOT EXISTS restoran (
    id SERIAL PRIMARY KEY,
    naziv VARCHAR(255) NOT NULL,
    broj_telefona VARCHAR(50),
    adresa TEXT,
    web_stranica VARCHAR(500),
    broj_recenzija INTEGER DEFAULT 0,
    ocjena DECIMAL(3, 2) DEFAULT 0,
    lokacija GEOGRAPHY(Point, 4326),
    radno_vrijeme JSONB DEFAULT '{}',
    restoran_detalji JSONB DEFAULT '{}',
    slika_url TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS recenzija (
    id SERIAL PRIMARY KEY,
    korisnik_id INTEGER REFERENCES korisnik(id) ON DELETE CASCADE,
    restoran_id INTEGER REFERENCES restoran(id) ON DELETE CASCADE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    ukupna_ocjena INTEGER CHECK (ukupna_ocjena >= 1 AND ukupna_ocjena <= 5),
    komentar TEXT,
    obrisano BOOLEAN DEFAULT FALSE,
    ocjene_detalji JSONB DEFAULT '{}'
);

CREATE TABLE IF NOT EXISTS posjet (
    id SERIAL PRIMARY KEY,
    korisnik_id INTEGER REFERENCES korisnik(id) ON DELETE CASCADE,
    restoran_id INTEGER REFERENCES restoran(id) ON DELETE CASCADE,
    vrijeme_posjeta TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    broj_osoba INTEGER DEFAULT 1
);

CREATE TABLE IF NOT EXISTS fotografija (
    id SERIAL PRIMARY KEY,
    restoran_id INTEGER REFERENCES restoran(id) ON DELETE CASCADE,
    korisnik_id INTEGER REFERENCES korisnik(id) ON DELETE SET NULL,
    slika_url TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_restoran_lokacija ON restoran USING GIST (lokacija);
CREATE INDEX IF NOT EXISTS idx_restoran_naziv ON restoran USING gin(to_tsvector('simple', naziv));
CREATE INDEX IF NOT EXISTS idx_restoran_detalji ON restoran USING gin(restoran_detalji);
CREATE INDEX IF NOT EXISTS idx_recenzija_restoran ON recenzija(restoran_id);
CREATE INDEX IF NOT EXISTS idx_posjet_korisnik ON posjet(korisnik_id);

CREATE OR REPLACE FUNCTION recalculate_restaurant_rating()
RETURNS TRIGGER AS $$
BEGIN
    IF TG_OP = 'DELETE' THEN
        UPDATE restoran
        SET 
            ocjena = COALESCE((
                SELECT AVG(ukupna_ocjena)::DECIMAL(3,2)
                FROM recenzija 
                WHERE restoran_id = OLD.restoran_id AND obrisano = FALSE
            ), 0),
            broj_recenzija = (
                SELECT COUNT(*)
                FROM recenzija 
                WHERE restoran_id = OLD.restoran_id AND obrisano = FALSE
            )
        WHERE id = OLD.restoran_id;
        RETURN OLD;
    ELSE
        UPDATE restoran
        SET 
            ocjena = COALESCE((
                SELECT AVG(ukupna_ocjena)::DECIMAL(3,2)
                FROM recenzija 
                WHERE restoran_id = NEW.restoran_id AND obrisano = FALSE
            ), 0),
            broj_recenzija = (
                SELECT COUNT(*)
                FROM recenzija 
                WHERE restoran_id = NEW.restoran_id AND obrisano = FALSE
            )
        WHERE id = NEW.restoran_id;
        RETURN NEW;
    END IF;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_recalculate_rating ON recenzija;
CREATE TRIGGER trigger_recalculate_rating
AFTER INSERT OR UPDATE OR DELETE ON recenzija
FOR EACH ROW
EXECUTE FUNCTION recalculate_restaurant_rating();

CREATE OR REPLACE FUNCTION on_user_delete()
RETURNS TRIGGER AS $$
BEGIN
    RAISE NOTICE 'Korisnik % obrisan, sve recenzije i posjeti će biti obrisani', OLD.username;
    RETURN OLD;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_user_delete ON korisnik;
CREATE TRIGGER trigger_user_delete
BEFORE DELETE ON korisnik
FOR EACH ROW
EXECUTE FUNCTION on_user_delete();

CREATE OR REPLACE FUNCTION get_restaurants_by_distance(
    lat DOUBLE PRECISION,
    lng DOUBLE PRECISION,
    radius_km DOUBLE PRECISION DEFAULT 10
)
RETURNS TABLE (
    id INTEGER,
    naziv VARCHAR,
    adresa TEXT,
    ocjena DECIMAL,
    broj_recenzija INTEGER,
    web_stranica VARCHAR,
    broj_telefona VARCHAR,
    restoran_detalji JSONB,
    radno_vrijeme JSONB,
    latitude DOUBLE PRECISION,
    longitude DOUBLE PRECISION,
    udaljenost_km DOUBLE PRECISION
) AS $$
BEGIN
    RETURN QUERY
    SELECT 
        r.id,
        r.naziv,
        r.adresa,
        r.ocjena,
        r.broj_recenzija,
        r.web_stranica,
        r.broj_telefona,
        r.restoran_detalji,
        r.radno_vrijeme,
        ST_Y(r.lokacija::geometry) as latitude,
        ST_X(r.lokacija::geometry) as longitude,
        ST_Distance(r.lokacija, ST_SetSRID(ST_MakePoint(lng, lat), 4326)::geography) / 1000 as udaljenost_km
    FROM restoran r
    WHERE ST_DWithin(
        r.lokacija,
        ST_SetSRID(ST_MakePoint(lng, lat), 4326)::geography,
        radius_km * 1000
    )
    ORDER BY udaljenost_km;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION search_restaurants(
    search_term TEXT,
    lat DOUBLE PRECISION DEFAULT NULL,
    lng DOUBLE PRECISION DEFAULT NULL
)
RETURNS TABLE (
    id INTEGER,
    naziv VARCHAR,
    adresa TEXT,
    ocjena DECIMAL,
    broj_recenzija INTEGER,
    web_stranica VARCHAR,
    restoran_detalji JSONB,
    latitude DOUBLE PRECISION,
    longitude DOUBLE PRECISION,
    udaljenost_km DOUBLE PRECISION,
    relevancy REAL
) AS $$
BEGIN
    RETURN QUERY
    SELECT 
        r.id,
        r.naziv,
        r.adresa,
        r.ocjena,
        r.broj_recenzija,
        r.web_stranica,
        r.restoran_detalji,
        ST_Y(r.lokacija::geometry) as latitude,
        ST_X(r.lokacija::geometry) as longitude,
        CASE 
            WHEN lat IS NOT NULL AND lng IS NOT NULL THEN
                ST_Distance(r.lokacija, ST_SetSRID(ST_MakePoint(lng, lat), 4326)::geography) / 1000
            ELSE NULL
        END as udaljenost_km,
        ts_rank(
            to_tsvector('simple', r.naziv || ' ' || COALESCE(r.adresa, '') || ' ' || COALESCE(r.restoran_detalji::text, '')),
            plainto_tsquery('simple', search_term)
        ) as relevancy
    FROM restoran r
    WHERE 
        to_tsvector('simple', r.naziv || ' ' || COALESCE(r.adresa, '') || ' ' || COALESCE(r.restoran_detalji::text, ''))
        @@ plainto_tsquery('simple', search_term)
        OR r.naziv ILIKE '%' || search_term || '%'
        OR r.adresa ILIKE '%' || search_term || '%'
        OR r.restoran_detalji::text ILIKE '%' || search_term || '%'
    ORDER BY 
        relevancy DESC,
        r.ocjena DESC,
        r.broj_recenzija DESC;
END;
$$ LANGUAGE plpgsql;

INSERT INTO korisnik (username, email, is_admin) VALUES 
    ('demo_user', 'demo@restorany.hr', FALSE),
    ('admin', 'admin@restorany.hr', TRUE)
ON CONFLICT (username) DO NOTHING;

INSERT INTO restoran (naziv, broj_telefona, adresa, web_stranica, lokacija, radno_vrijeme, restoran_detalji, slika_url) VALUES
('Pizzeria Napoli', '+385 42 123 456', 'Trg slobode 5, 42000 Varaždin', 'https://pizzeria-napoli.hr', ST_SetSRID(ST_MakePoint(16.3366, 46.3044), 4326)::geography, '{"pon-pet": "10:00-22:00", "sub": "11:00-23:00", "ned": "12:00-21:00"}', '{"kategorije": ["talijanski", "pizzeria"], "cijena": "$$", "jela": ["pizza", "pasta", "salate"], "pogodnosti": ["wifi", "parking"], "dostava": ["Wolt", "Glovo"]}', 'uploads/r1.jpeg'),
('Restoran Zlatna Guska', '+385 42 234 567', 'Ulica braće Radić 12, 42000 Varaždin', 'https://zlatna-guska.hr', ST_SetSRID(ST_MakePoint(16.3380, 46.3065), 4326)::geography, '{"pon-pet": "11:00-23:00", "sub-ned": "12:00-24:00"}', '{"kategorije": ["hrvatska", "tradicionalno"], "cijena": "$$$", "jela": ["guska", "purica", "štrukli"], "pogodnosti": ["wifi", "parking", "terasa"]}', 'uploads/r2.jpeg'),
('Sushi Bar Tokyo', '+385 42 345 678', 'Kapucinski trg 3, 42000 Varaždin', NULL, ST_SetSRID(ST_MakePoint(16.3350, 46.3055), 4326)::geography, '{"pon-sub": "12:00-22:00", "ned": "zatvoreno"}', '{"kategorije": ["japanski", "sushi"], "cijena": "$$$", "jela": ["sushi", "ramen", "tempura"], "pogodnosti": ["wifi"], "dostava": ["Wolt"]}', 'uploads/r3.jpeg'),
('Burger House', '+385 42 456 789', 'Ivana Padovca 8, 42000 Varaždin', 'https://burger-house.hr', ST_SetSRID(ST_MakePoint(16.3400, 46.3080), 4326)::geography, '{"pon-ned": "10:00-23:00"}', '{"kategorije": ["američki", "fast food"], "cijena": "$", "jela": ["burgeri", "pomfrit", "milkshake"], "pogodnosti": ["wifi", "pet-friendly"], "dostava": ["Wolt", "Glovo", "Bolt Food"]}', 'uploads/r4.jpeg'),
('Konoba Stari Grad', '+385 1 567 890', 'Tkalčićeva 42, 10000 Zagreb', 'https://konoba-starigrad.hr', ST_SetSRID(ST_MakePoint(15.9780, 45.8150), 4326)::geography, '{"pon-sub": "11:00-24:00", "ned": "12:00-22:00"}', '{"kategorije": ["hrvatska", "dalmatinski"], "cijena": "$$$", "jela": ["riba", "škampi", "pašticada"], "pogodnosti": ["wifi", "terasa", "live muzika"]}', 'uploads/r5.jpeg'),
('Vinodol', '+385 1 481 1427', 'Teslina 10, 10000 Zagreb', 'https://vinodol.hr', ST_SetSRID(ST_MakePoint(15.9750, 45.8130), 4326)::geography, '{"pon-ned": "10:00-24:00"}', '{"kategorije": ["hrvatska", "međunarodna"], "cijena": "$$$", "jela": ["janjetina", "punjene paprike", "štrukli"], "pogodnosti": ["wifi", "parking", "privatne sobe"]}', 'uploads/r6.jpeg'),
('Takenoko', '+385 1 486 0530', 'Nova Ves 17, 10000 Zagreb', 'https://takenoko.hr', ST_SetSRID(ST_MakePoint(15.9700, 45.8200), 4326)::geography, '{"pon-sub": "12:00-23:00", "ned": "12:00-22:00"}', '{"kategorije": ["japanski", "fusion"], "cijena": "$$$$", "jela": ["sushi", "sashimi", "wagyu"], "pogodnosti": ["wifi", "valet parking"]}', 'uploads/r7.jpeg'),
('Submarine Burger', '+385 1 234 5678', 'Jarunska 2, 10000 Zagreb', 'https://submarine-burger.hr', ST_SetSRID(ST_MakePoint(15.9200, 45.7900), 4326)::geography, '{"pon-ned": "11:00-23:00"}', '{"kategorije": ["američki", "burgeri"], "cijena": "$$", "jela": ["craft burgeri", "ribblji burger", "veganski burger"], "pogodnosti": ["wifi", "parking", "pet-friendly"], "dostava": ["Wolt", "Glovo"]}', 'uploads/r8.jpeg')
ON CONFLICT DO NOTHING;

INSERT INTO recenzija (korisnik_id, restoran_id, ukupna_ocjena, komentar, ocjene_detalji) VALUES
(1, 1, 5, 'Najbolja pizza u gradu! Osoblje izuzetno ljubazno.', '{"hrana": 5, "usluga": 5, "ambijent": 4, "vrijednost_za_novac": 5}'),
(1, 2, 4, 'Odlična tradicionalna hrana, malo skuplje ali vrijedi.', '{"hrana": 5, "usluga": 4, "ambijent": 5, "vrijednost_za_novac": 3}'),
(2, 1, 4, 'Jako dobra pizza, ponekad treba čekati duže.', '{"hrana": 4, "usluga": 3, "ambijent": 4, "vrijednost_za_novac": 4, "cekano_minuta": 30}'),
(1, 4, 5, 'Fantastični burgeri! Preporučam cheese bacon.', '{"hrana": 5, "usluga": 5, "ambijent": 4, "vrijednost_za_novac": 5}'),
(2, 5, 5, 'Autentična dalmatinska kuhinja usred Zagreba.', '{"hrana": 5, "usluga": 5, "ambijent": 5, "vrijednost_za_novac": 4}')
ON CONFLICT DO NOTHING;

INSERT INTO posjet (korisnik_id, restoran_id, broj_osoba) VALUES
(1, 1, 2),
(1, 2, 4),
(1, 4, 1),
(2, 1, 3),
(2, 5, 2)
ON CONFLICT DO NOTHING;
