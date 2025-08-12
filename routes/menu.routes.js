// routes/menu.js
const express = require('express');
const pool = require('../db');
const auth = require('../middleware/auth');
const admin = require('../middleware/admin');
const multer = require('multer');
const path = require('path');
const router = express.Router();

// Multer (optional; still supports local file uploads)
const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, 'uploads/'),
  filename: (req, file, cb) => cb(null, Date.now() + path.extname(file.originalname)),
});
const upload = multer({ storage });

// GET all available menu items
router.get('/', async (_, res) => {
  try {
    const [rows] = await pool.query('SELECT * FROM menu_items WHERE available=1');
    res.json(rows);
  } catch (err) {
    console.error('Error fetching menu:', err);
    res.status(500).json({ error: 'Failed to fetch menu' });
  }
});

// CREATE (supports either multipart file OR image_url string from Cloudinary)
router.post('/', auth, admin, upload.single('image'), async (req, res) => {
  try {
    const { name, description, price, category, image_url: bodyUrl } = req.body;
    if (!name || !price || !category) {
      return res.status(400).json({ error: 'Name, price, and category are required' });
    }

    // Prefer uploaded file if present, else use provided URL (e.g., Cloudinary secure_url)
    const image_url = req.file ? `/uploads/${req.file.filename}` : (bodyUrl || null);

    const [result] = await pool.query(
      'INSERT INTO menu_items (name, description, price, category, image_url, available) VALUES (?,?,?,?,?,?)',
      [name, description || null, parseFloat(price), category, image_url, 1]
    );
    const [newItem] = await pool.query('SELECT * FROM menu_items WHERE id = ?', [result.insertId]);
    res.status(201).json(newItem[0]);
  } catch (err) {
    console.error('Error creating menu item:', err);
    res.status(500).json({ error: 'Failed to create menu item' });
  }
});

// UPDATE (won’t overwrite image_url unless a new one is provided)
router.put('/:id', auth, admin, upload.single('image'), async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    const { name, description, price, category } = req.body;

    if (!name || !price || !category) {
      return res.status(400).json({ error: 'Name, price, and category are required' });
    }

    const [existingRows] = await pool.query('SELECT * FROM menu_items WHERE id = ?', [id]);
    if (existingRows.length === 0) return res.status(404).json({ error: 'Menu item not found' });
    const existing = existingRows[0];

    // Determine final image URL:
    // - If a new file uploaded -> use it
    // - Else if body has image_url (Cloudinary) -> use it
    // - Else keep existing
    const incomingUrl = req.body.image_url;
    const finalImageUrl = req.file
      ? `/uploads/${req.file.filename}`
      : (typeof incomingUrl === 'string' && incomingUrl.trim() !== '' ? incomingUrl.trim() : existing.image_url);

    const available = req.body.available !== undefined ? parseInt(req.body.available) : existing.available;

    await pool.query(
      'UPDATE menu_items SET name=?, description=?, price=?, category=?, image_url=?, available=? WHERE id=?',
      [name, description || null, parseFloat(price), category, finalImageUrl, available, id]
    );

    const [updatedItem] = await pool.query('SELECT * FROM menu_items WHERE id = ?', [id]);
    res.json(updatedItem[0]);
  } catch (err) {
    console.error('Error updating menu item:', err);
    res.status(500).json({ error: 'Failed to update menu item' });
  }
});

// DELETE
router.delete('/:id', auth, admin, async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    const [result] = await pool.query('DELETE FROM menu_items WHERE id=?', [id]);
    if (result.affectedRows === 0) return res.status(404).json({ error: 'Menu item not found' });
    res.json({ message: 'Deleted' });
  } catch (err) {
    console.error('Error deleting menu item:', err);
    res.status(500).json({ error: 'Failed to delete menu item' });
  }
});

module.exports = router;
