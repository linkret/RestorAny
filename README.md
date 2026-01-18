# RestorAny

Aplikacija za otkrivanje restorana s interaktivnom kartom i PostGIS prostornim upitima.

## Preduvjeti

- [Node.js](https://nodejs.org/) (v18 ili noviji)
- [PostgreSQL](https://www.postgresql.org/) (v14 ili noviji)
- [PostGIS](https://postgis.net/) ekstenzija za PostgreSQL

## Instalacija

1. **Klonirajte repozitorij:**
   ```bash
   git clone <url-repozitorija>
   cd RestorAny
   ```

2. **Instalirajte Node.js ovisnosti:**
   ```bash
   npm install
   ```

3. **Konfigurirajte bazu podataka:**
   
   Kopirajte `.env.example` u `.env` i postavite svoju lozinku za PostgreSQL korisnika:
   ```bash
   cp .env.example .env
   ```
   
   Uredite `.env` datoteku:
   ```
   DB_PASSWORD=vasa_lozinka
   ```

4. **Inicijalizirajte bazu podataka:**
   ```bash
   npm run init-db
   ```
   
   Ovo će kreirati bazu podataka, tablice i upisati početne podatke.

5. **Pokrenite aplikaciju:**
   ```bash
   npm start
   ```

6. **Otvorite u pregledniku:**
   ```
   http://localhost:3000
   ```