// routes/categories.routes.js
const express = require('express');
const router = express.Router();
const pool = require('../db');   // ✅ shared MySQL pool

// ─────────────────── Get all categories ───────────────────
router.get('/', async (req, res) => {
  try {
    const [rows] = await pool.query(
      'SELECT id, name, description, image, created_at, updated_at FROM categories ORDER BY id DESC'
    );
    res.json(rows);
  } catch (err) {
    console.error('❌ Failed to fetch categories:', err.message);
    res.status(500).json({ error: 'Failed to fetch categories' });
  }
});

// ─────────────────── Get category by ID ───────────────────
router.get('/:id', async (req, res) => {
  try {
    const [rows] = await pool.query('SELECT * FROM categories WHERE id = ?', [
      req.params.id,
    ]);
    if (rows.length === 0) {
      return res.status(404).json({ error: 'Category not found' });
    }
    res.json(rows[0]);
  } catch (err) {
    console.error('❌ Failed to fetch category:', err.message);
    res.status(500).json({ error: 'Failed to fetch category' });
  }
});

// ─────────────────── Create category ───────────────────
router.post('/', async (req, res) => {
  try {
    const { name, description, image } = req.body;
    if (!name) return res.status(400).json({ error: 'Name is required' });

    const [result] = await pool.query(
      'INSERT INTO categories (name, description, image) VALUES (?, ?, ?)',
      [name, description || null, image || null]
    );

    res.status(201).json({ id: result.insertId, name, description, image });
  } catch (err) {
    console.error('❌ Failed to create category:', err.message);
    res.status(500).json({ error: 'Failed to create category' });
  }
});

// ─────────────────── Update category ───────────────────
router.put('/:id', async (req, res) => {
  try {
    const { name, description, image } = req.body;
    const [result] = await pool.query(
      'UPDATE categories SET name=?, description=?, image=? WHERE id=?',
      [name, description || null, image || null, req.params.id]
    );

    if (result.affectedRows === 0)
      return res.status(404).json({ error: 'Category not found' });

    res.json({ message: 'Category updated successfully' });
  } catch (err) {
    console.error('❌ Failed to update category:', err.message);
    res.status(500).json({ error: 'Failed to update category' });
  }
});

// ─────────────────── Delete category ───────────────────
router.delete('/:id', async (req, res) => {
  try {
    const [result] = await pool.query('DELETE FROM categories WHERE id=?', [
      req.params.id,
    ]);
    if (result.affectedRows === 0)
      return res.status(404).json({ error: 'Category not found' });

    res.json({ message: 'Category deleted successfully' });
  } catch (err) {
    console.error('❌ Failed to delete category:', err.message);
    res.status(500).json({ error: 'Failed to delete category' });
  }
});

module.exports = router;
