const express = require('express');
const pool = require('../db');
const auth = require('../middleware/auth');
const admin = require('../middleware/admin');
const multer = require('multer');
const path = require('path');

const router = express.Router();

// ─── Multer config for optional local file uploads ───
const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, 'uploads/'),
  filename: (req, file, cb) => cb(null, Date.now() + path.extname(file.originalname)),
});
const upload = multer({ storage });

/* ─── GET all available menu items ─── */
router.get('/', async (_req, res) => {
  try {
    const [rows] = await pool.query(
      'SELECT * FROM menu_items WHERE available=1 ORDER BY id DESC'
    );
    res.json(rows);
  } catch (err) {
    console.error('Error fetching menu:', err);
    res.status(500).json({ error: 'Failed to fetch menu' });
  }
});

/* ─── GET single menu item by id ─── */
router.get('/:id', async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    if (isNaN(id)) return res.status(400).json({ error: 'Invalid id' });

    const [rows] = await pool.query('SELECT * FROM menu_items WHERE id = ?', [id]);
    if (rows.length === 0)
      return res.status(404).json({ error: 'Menu item not found' });

    res.json(rows[0]);
  } catch (err) {
    console.error('Error fetching menu item:', err);
    res.status(500).json({ error: 'Failed to fetch menu item' });
  }
});

/* ─── CREATE menu item ─── */
router.post('/', auth, admin, upload.single('image'), async (req, res) => {
  try {
    const { name, description, price, category_id, image_url: bodyUrl } = req.body;
    if (!name || !price || !category_id) {
      return res.status(400).json({ error: 'Name, price, and category_id are required' });
    }

    // Validate category exists
    const [catRows] = await pool.query('SELECT id FROM categories WHERE id = ?', [category_id]);
    if (catRows.length === 0) {
      return res.status(400).json({ error: 'Invalid category_id' });
    }

    // Prefer uploaded file if present, else use Cloudinary/local URL
    const finalImageUrl = req.file
      ? `/uploads/${req.file.filename}`
      : (bodyUrl?.trim() || null);

    const [result] = await pool.query(
      'INSERT INTO menu_items (name, description, price, category_id, image_url, available) VALUES (?,?,?,?,?,1)',
      [name, description || null, parseFloat(price), category_id, finalImageUrl]
    );

    const [newItem] = await pool.query('SELECT * FROM menu_items WHERE id = ?', [result.insertId]);
    res.status(201).json(newItem[0]);
  } catch (err) {
    console.error('Error creating menu item:', err);
    res.status(500).json({ error: 'Failed to create menu item' });
  }
});

/* ─── UPDATE menu item ─── */
router.put('/:id', auth, admin, upload.single('image'), async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    const { name, description, price, category_id, image_url: incomingUrl, available } = req.body;

    if (!name || !price || !category_id) {
      return res.status(400).json({ error: 'Name, price, and category_id are required' });
    }

    // Validate category exists
    const [catRows] = await pool.query('SELECT id FROM categories WHERE id = ?', [category_id]);
    if (catRows.length === 0) {
      return res.status(400).json({ error: 'Invalid category_id' });
    }

    // Fetch existing item
    const [existingRows] = await pool.query('SELECT * FROM menu_items WHERE id = ?', [id]);
    if (existingRows.length === 0) return res.status(404).json({ error: 'Menu item not found' });
    const existing = existingRows[0];

    // Decide final image URL
    const finalImageUrl = req.file
      ? `/uploads/${req.file.filename}`
      : (incomingUrl?.trim() || existing.image_url);

    const finalAvailable = available !== undefined ? parseInt(available) : existing.available;

    await pool.query(
      'UPDATE menu_items SET name=?, description=?, price=?, category_id=?, image_url=?, available=? WHERE id=?',
      [name, description || null, parseFloat(price), category_id, finalImageUrl, finalAvailable, id]
    );

    const [updatedItem] = await pool.query('SELECT * FROM menu_items WHERE id = ?', [id]);
    res.json(updatedItem[0]);
  } catch (err) {
    console.error('Error updating menu item:', err);
    res.status(500).json({ error: 'Failed to update menu item' });
  }
});

/* ─── DELETE menu item ─── */
router.delete('/:id', auth, admin, async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    const [result] = await pool.query('DELETE FROM menu_items WHERE id=?', [id]);
    if (result.affectedRows === 0)
      return res.status(404).json({ error: 'Menu item not found' });

    res.json({ message: 'Deleted' });
  } catch (err) {
    console.error('Error deleting menu item:', err);
    res.status(500).json({ error: 'Failed to delete menu item' });
  }
});

module.exports = router;
