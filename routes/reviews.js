const express = require('express');
const router = express.Router();
const pool = require('../db');

// Get all reviews for a restaurant
router.get('/restaurant/:restaurantId', async (req, res) => {
  try {
    const { restaurantId } = req.params;
    const { page = 1, limit = 20 } = req.query;
    const offset = (page - 1) * limit;
    
    const query = `
      SELECT 
        r.id, r.ukupna_ocjena, r.komentar, r.created_at, r.ocjene_detalji,
        k.username, k.id as korisnik_id
      FROM recenzija r
      JOIN korisnik k ON r.korisnik_id = k.id
      WHERE r.restoran_id = $1 AND r.obrisano = FALSE
      ORDER BY r.created_at DESC
      LIMIT $2 OFFSET $3
    `;
    
    const result = await pool.query(query, [restaurantId, limit, offset]);
    
    // Get total count
    const countResult = await pool.query(
      'SELECT COUNT(*) FROM recenzija WHERE restoran_id = $1 AND obrisano = FALSE',
      [restaurantId]
    );
    
    res.json({
      reviews: result.rows,
      total: parseInt(countResult.rows[0].count),
      page: parseInt(page),
      limit: parseInt(limit)
    });
  } catch (err) {
    console.error('Error fetching reviews:', err);
    res.status(500).json({ error: err.message });
  }
});

// Get reviews by user
router.get('/user/:userId', async (req, res) => {
  try {
    const { userId } = req.params;
    
    const query = `
      SELECT 
        r.id, r.ukupna_ocjena, r.komentar, r.created_at, r.ocjene_detalji,
        rest.id as restoran_id, rest.naziv as restoran_naziv, rest.adresa
      FROM recenzija r
      JOIN restoran rest ON r.restoran_id = rest.id
      WHERE r.korisnik_id = $1 AND r.obrisano = FALSE
      ORDER BY r.created_at DESC
    `;
    
    const result = await pool.query(query, [userId]);
    res.json(result.rows);
  } catch (err) {
    console.error('Error fetching user reviews:', err);
    res.status(500).json({ error: err.message });
  }
});

// Create new review
router.post('/', async (req, res) => {
  try {
    const { korisnik_id, restoran_id, ukupna_ocjena, komentar, ocjene_detalji } = req.body;
    
    if (!korisnik_id || !restoran_id || !ukupna_ocjena) {
      return res.status(400).json({ error: 'Korisnik, restoran i ocjena su obavezni' });
    }
    
    if (ukupna_ocjena < 1 || ukupna_ocjena > 5) {
      return res.status(400).json({ error: 'Ocjena mora biti između 1 i 5' });
    }
    
    // Check if user already reviewed this restaurant
    const existingReview = await pool.query(
      'SELECT id FROM recenzija WHERE korisnik_id = $1 AND restoran_id = $2 AND obrisano = FALSE',
      [korisnik_id, restoran_id]
    );
    
    if (existingReview.rows.length > 0) {
      return res.status(400).json({ error: 'Već ste ocijenili ovaj restoran' });
    }
    
    const query = `
      INSERT INTO recenzija (korisnik_id, restoran_id, ukupna_ocjena, komentar, ocjene_detalji)
      VALUES ($1, $2, $3, $4, $5)
      RETURNING *
    `;
    
    const result = await pool.query(query, [
      korisnik_id, 
      restoran_id, 
      ukupna_ocjena, 
      komentar || null,
      JSON.stringify(ocjene_detalji || {})
    ]);
    
    res.status(201).json(result.rows[0]);
  } catch (err) {
    console.error('Error creating review:', err);
    res.status(500).json({ error: err.message });
  }
});

// Update review
router.put('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { ukupna_ocjena, komentar, ocjene_detalji } = req.body;
    
    const query = `
      UPDATE recenzija SET
        ukupna_ocjena = COALESCE($2, ukupna_ocjena),
        komentar = COALESCE($3, komentar),
        ocjene_detalji = COALESCE($4::jsonb, ocjene_detalji)
      WHERE id = $1 AND obrisano = FALSE
      RETURNING *
    `;
    
    const result = await pool.query(query, [
      id,
      ukupna_ocjena,
      komentar,
      ocjene_detalji ? JSON.stringify(ocjene_detalji) : null
    ]);
    
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Recenzija nije pronađena' });
    }
    
    res.json(result.rows[0]);
  } catch (err) {
    console.error('Error updating review:', err);
    res.status(500).json({ error: err.message });
  }
});

// Delete (soft delete) review
router.delete('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    
    const result = await pool.query(
      'UPDATE recenzija SET obrisano = TRUE WHERE id = $1 RETURNING id, restoran_id',
      [id]
    );
    
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Recenzija nije pronađena' });
    }
    
    res.json({ message: 'Recenzija uspješno obrisana', id: result.rows[0].id });
  } catch (err) {
    console.error('Error deleting review:', err);
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
