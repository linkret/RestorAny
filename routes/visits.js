const express = require('express');
const router = express.Router();
const pool = require('../db');

// Get all visits for a user
router.get('/user/:userId', async (req, res) => {
  try {
    const { userId } = req.params;
    
    const query = `
      SELECT 
        p.id, p.vrijeme_posjeta, p.broj_osoba,
        r.id as restoran_id, r.naziv as restoran_naziv, r.adresa,
        r.ocjena, ST_Y(r.lokacija::geometry) as latitude, ST_X(r.lokacija::geometry) as longitude
      FROM posjet p
      JOIN restoran r ON p.restoran_id = r.id
      WHERE p.korisnik_id = $1
      ORDER BY p.vrijeme_posjeta DESC
    `;
    
    const result = await pool.query(query, [userId]);
    res.json(result.rows);
  } catch (err) {
    console.error('Error fetching visits:', err);
    res.status(500).json({ error: err.message });
  }
});

// Get visits for a restaurant
router.get('/restaurant/:restaurantId', async (req, res) => {
  try {
    const { restaurantId } = req.params;
    
    const query = `
      SELECT 
        p.id, p.vrijeme_posjeta, p.broj_osoba,
        k.username
      FROM posjet p
      JOIN korisnik k ON p.korisnik_id = k.id
      WHERE p.restoran_id = $1
      ORDER BY p.vrijeme_posjeta DESC
    `;
    
    const result = await pool.query(query, [restaurantId]);
    res.json(result.rows);
  } catch (err) {
    console.error('Error fetching restaurant visits:', err);
    res.status(500).json({ error: err.message });
  }
});

// Create new visit
router.post('/', async (req, res) => {
  try {
    const { korisnik_id, restoran_id, broj_osoba = 1, vrijeme_posjeta } = req.body;
    
    if (!korisnik_id || !restoran_id) {
      return res.status(400).json({ error: 'Korisnik i restoran su obavezni' });
    }
    
    const query = `
      INSERT INTO posjet (korisnik_id, restoran_id, broj_osoba, vrijeme_posjeta)
      VALUES ($1, $2, $3, COALESCE($4::timestamp with time zone, CURRENT_TIMESTAMP))
      RETURNING *
    `;
    
    const result = await pool.query(query, [
      korisnik_id,
      restoran_id,
      broj_osoba,
      vrijeme_posjeta || null
    ]);
    
    res.status(201).json(result.rows[0]);
  } catch (err) {
    console.error('Error creating visit:', err);
    res.status(500).json({ error: err.message });
  }
});

// Delete visit
router.delete('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    
    const result = await pool.query(
      'DELETE FROM posjet WHERE id = $1 RETURNING id',
      [id]
    );
    
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Posjet nije pronađen' });
    }
    
    res.json({ message: 'Posjet uspješno obrisan', id: result.rows[0].id });
  } catch (err) {
    console.error('Error deleting visit:', err);
    res.status(500).json({ error: err.message });
  }
});

// Get visit statistics for a user
router.get('/user/:userId/stats', async (req, res) => {
  try {
    const { userId } = req.params;
    
    const query = `
      SELECT 
        COUNT(*) as total_visits,
        COUNT(DISTINCT restoran_id) as unique_restaurants,
        SUM(broj_osoba) as total_people,
        MIN(vrijeme_posjeta) as first_visit,
        MAX(vrijeme_posjeta) as last_visit
      FROM posjet
      WHERE korisnik_id = $1
    `;
    
    const result = await pool.query(query, [userId]);
    res.json(result.rows[0]);
  } catch (err) {
    console.error('Error fetching visit stats:', err);
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
