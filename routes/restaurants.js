const express = require('express');
const router = express.Router();
const pool = require('../db');

// Get upload middleware from app
let upload;
router.use((req, res, next) => {
  if (!upload) {
    upload = req.app.get('upload');
  }
  next();
});

// Get restaurants
router.get('/', async (req, res) => {
  try {
    const { lat, lng, radius = 50 } = req.query;
    
    let query;
    let params = [];
    
    if (lat && lng) {
      query = `SELECT * FROM get_restaurants_by_distance($1, $2, $3)`;
      params = [parseFloat(lat), parseFloat(lng), parseFloat(radius)];
    } else {
      query = `
        SELECT 
          id, naziv, adresa, ocjena, broj_recenzija, web_stranica, 
          broj_telefona, restoran_detalji, radno_vrijeme, slika_url,
          ST_Y(lokacija::geometry) as latitude,
          ST_X(lokacija::geometry) as longitude
        FROM restoran
        ORDER BY ocjena DESC, broj_recenzija DESC
      `;
    }
    
    const result = await pool.query(query, params);
    res.json(result.rows);
  } catch (err) {
    console.error('Error fetching restaurants:', err);
    res.status(500).json({ error: err.message });
  }
});

// Search restaurants
router.get('/search', async (req, res) => {
  try {
    const { q, lat, lng } = req.query;
    
    let query, params;
    
    query = `SELECT * FROM search_restaurants($1, $2, $3)`;
    params = [q, parseFloat(lat), parseFloat(lng)];
  
    const result = await pool.query(query, params);
    res.json(result.rows);
  } catch (err) {
    console.error('Error searching restaurants:', err);
    res.status(500).json({ error: err.message });
  }
});

// Get single restaurant by ID
router.get('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { lat, lng } = req.query;
    
    let query = `
      SELECT 
        id, naziv, adresa, ocjena, broj_recenzija, web_stranica, 
        broj_telefona, restoran_detalji, radno_vrijeme, slika_url, created_at,
        ST_Y(lokacija::geometry) as latitude,
        ST_X(lokacija::geometry) as longitude
    `;
    
    if (lat && lng) {
      query += `,
        ST_Distance(
          lokacija, 
          ST_SetSRID(ST_MakePoint($2, $3), 4326)::geography
        ) / 1000 as udaljenost_km
      `;
    }
    
    query += ` FROM restoran WHERE id = $1`;
    
    const params = lat && lng ? [id, parseFloat(lng), parseFloat(lat)] : [id];
    const result = await pool.query(query, params);
    
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Restoran nije pronađen' });
    }
    
    res.json(result.rows[0]);
  } catch (err) {
    console.error('Error fetching restaurant:', err);
    res.status(500).json({ error: err.message });
  }
});

// Create new restaurant (with image upload)
router.post('/', (req, res, next) => {
  upload.single('slika')(req, res, async (err) => {
    if (err) {
      return res.status(400).json({ error: err.message });
    }
    
    try {
      // Parse JSON fields from FormData
      let restoran_detalji = {};
      let radno_vrijeme = {};
      
      if (req.body.restoran_detalji) {
        try {
          restoran_detalji = JSON.parse(req.body.restoran_detalji);
        } catch (e) {
          restoran_detalji = {};
        }
      }
      
      if (req.body.radno_vrijeme) {
        try {
          radno_vrijeme = JSON.parse(req.body.radno_vrijeme);
        } catch (e) {
          radno_vrijeme = {};
        }
      }
      
      const { 
        naziv, broj_telefona, adresa, web_stranica, 
        latitude, longitude 
      } = req.body;
      
      if (!naziv || !latitude || !longitude) {
        return res.status(400).json({ error: 'Naziv i lokacija su obavezni' });
      }
      
      // Get image URL if uploaded
      const slika_url = req.file ? `/uploads/${req.file.filename}` : null;
      
      const query = `
        INSERT INTO restoran (
          naziv, broj_telefona, adresa, web_stranica, 
          lokacija, radno_vrijeme, restoran_detalji, slika_url
        ) VALUES (
          $1, $2, $3, $4,
          ST_SetSRID(ST_MakePoint($5, $6), 4326)::geography,
          $7, $8, $9
        )
        RETURNING 
          id, naziv, adresa, ocjena, broj_recenzija, web_stranica,
          broj_telefona, restoran_detalji, radno_vrijeme, slika_url, created_at,
          ST_Y(lokacija::geometry) as latitude,
          ST_X(lokacija::geometry) as longitude
      `;
      
      const params = [
        naziv, 
        broj_telefona || null, 
        adresa || null, 
        web_stranica || null,
        parseFloat(longitude),
        parseFloat(latitude),
        JSON.stringify(radno_vrijeme),
        JSON.stringify(restoran_detalji),
        slika_url
      ];
      
      const result = await pool.query(query, params);
      res.status(201).json(result.rows[0]);
    } catch (err) {
      console.error('Error creating restaurant:', err);
      res.status(500).json({ error: err.message });
    }
  });
});

// Update restaurant
router.put('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { 
      naziv, broj_telefona, adresa, web_stranica, 
      latitude, longitude, radno_vrijeme, restoran_detalji 
    } = req.body;
    
    const query = `
      UPDATE restoran SET
        naziv = COALESCE($2, naziv),
        broj_telefona = COALESCE($3, broj_telefona),
        adresa = COALESCE($4, adresa),
        web_stranica = COALESCE($5, web_stranica),
        lokacija = CASE 
          WHEN $6::double precision IS NOT NULL AND $7::double precision IS NOT NULL 
          THEN ST_SetSRID(ST_MakePoint($6, $7), 4326)::geography
          ELSE lokacija
        END,
        radno_vrijeme = COALESCE($8::jsonb, radno_vrijeme),
        restoran_detalji = COALESCE($9::jsonb, restoran_detalji)
      WHERE id = $1
      RETURNING 
        id, naziv, adresa, ocjena, broj_recenzija, web_stranica,
        broj_telefona, restoran_detalji, radno_vrijeme,
        ST_Y(lokacija::geometry) as latitude,
        ST_X(lokacija::geometry) as longitude
    `;
    
    const params = [
      id, naziv, broj_telefona, adresa, web_stranica,
      longitude ? parseFloat(longitude) : null,
      latitude ? parseFloat(latitude) : null,
      radno_vrijeme ? JSON.stringify(radno_vrijeme) : null,
      restoran_detalji ? JSON.stringify(restoran_detalji) : null
    ];
    
    const result = await pool.query(query, params);
    
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Restoran nije pronađen' });
    }
    
    res.json(result.rows[0]);
  } catch (err) {
    console.error('Error updating restaurant:', err);
    res.status(500).json({ error: err.message });
  }
});

// Delete restaurant
router.delete('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const result = await pool.query(
      'DELETE FROM restoran WHERE id = $1 RETURNING id',
      [id]
    );
    
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Restoran nije pronađen' });
    }
    
    res.json({ message: 'Restoran uspješno obrisan', id: result.rows[0].id });
  } catch (err) {
    console.error('Error deleting restaurant:', err);
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
