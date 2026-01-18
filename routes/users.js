const express = require('express');
const router = express.Router();
const pool = require('../db');

// Get all users
router.get('/', async (req, res) => {
  try {
    const result = await pool.query(
      'SELECT id, username, email, created_at, is_admin FROM korisnik ORDER BY created_at DESC'
    );
    res.json(result.rows);
  } catch (err) {
    console.error('Error fetching users:', err);
    res.status(500).json({ error: err.message });
  }
});

// Get user by ID
router.get('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const result = await pool.query(
      'SELECT id, username, email, created_at, is_admin FROM korisnik WHERE id = $1',
      [id]
    );
    
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Korisnik nije pronađen' });
    }
    
    res.json(result.rows[0]);
  } catch (err) {
    console.error('Error fetching user:', err);
    res.status(500).json({ error: err.message });
  }
});

// Create new user
router.post('/', async (req, res) => {
  try {
    const { username, email, is_admin = false } = req.body;
    
    if (!username || !email) {
      return res.status(400).json({ error: 'Username i email su obavezni' });
    }
    
    const result = await pool.query(
      `INSERT INTO korisnik (username, email, is_admin) 
       VALUES ($1, $2, $3) 
       RETURNING id, username, email, created_at, is_admin`,
      [username, email, is_admin]
    );
    
    res.status(201).json(result.rows[0]);
  } catch (err) {
    if (err.code === '23505') { // Unique violation
      return res.status(400).json({ error: 'Username ili email već postoji' });
    }
    console.error('Error creating user:', err);
    res.status(500).json({ error: err.message });
  }
});

// Update user
router.put('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { username, email } = req.body;
    
    const result = await pool.query(
      `UPDATE korisnik SET
        username = COALESCE($2, username),
        email = COALESCE($3, email)
       WHERE id = $1
       RETURNING id, username, email, created_at, is_admin`,
      [id, username, email]
    );
    
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Korisnik nije pronađen' });
    }
    
    res.json(result.rows[0]);
  } catch (err) {
    if (err.code === '23505') {
      return res.status(400).json({ error: 'Username ili email već postoji' });
    }
    console.error('Error updating user:', err);
    res.status(500).json({ error: err.message });
  }
});

// Delete user
router.delete('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    
    const result = await pool.query(
      'DELETE FROM korisnik WHERE id = $1 RETURNING id, username',
      [id]
    );
    
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Korisnik nije pronađen' });
    }
    
    res.json({ 
      message: 'Korisnik i svi povezani podaci uspješno obrisani', 
      id: result.rows[0].id,
      username: result.rows[0].username
    });
  } catch (err) {
    console.error('Error deleting user:', err);
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
