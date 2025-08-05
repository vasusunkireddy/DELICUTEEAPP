// routes/menu.js
const express = require('express');
const pool = require('../db');
const auth = require('../middleware/auth');
const admin = require('../middleware/admin');
const multer = require('multer');
const path = require('path');
const router = express.Router();

// Configure multer for image uploads
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, 'uploads/'); // Ensure this directory exists
  },
  filename: (req, file, cb) => {
    cb(null, Date.now() + path.extname(file.originalname)); // Unique filename
  },
});
const upload = multer({ storage });

// GET all menu
router.get('/', async (_, res) => {
  try {
    const [rows] = await pool.query('SELECT * FROM menu_items WHERE available=1');
    console.log('Fetched menu items:', rows);
    res.json(rows);
  } catch (err) {
    console.error('Error fetching menu:', err);
    res.status(500).json({ error: 'Failed to fetch menu' });
  }
});

// admin CRUD
router.post('/', auth, admin, upload.single('image'), async (req, res) => {
  const { name, description, price, category } = req.body;
  const image_url = req.file ? `/uploads/${req.file.filename}` : req.body.image_url || null;
  if (!name || !price || !category) {
    return res.status(400).json({ error: 'Name, price, and category are required' });
  }
  try {
    const [result] = await pool.query(
      'INSERT INTO menu_items (name, description, price, category, image_url, available) VALUES (?,?,?,?,?,?)',
      [name, description, parseFloat(price), category, image_url, 1]
    );
    const [newItem] = await pool.query('SELECT * FROM menu_items WHERE id = ?', [result.insertId]);
    console.log('Created item:', newItem[0]);
    res.status(201).json(newItem[0]);
  } catch (err) {
    console.error('Error creating menu item:', err);
    res.status(500).json({ error: 'Failed to create menu item' });
  }
});

router.put('/:id', auth, admin, upload.single('image'), async (req, res) => {
  const { name, description, price, category, available = 1 } = req.body;
  const image_url = req.file ? `/uploads/${req.file.filename}` : req.body.image_url || null;
  if (!name || !price || !category) {
    return res.status(400).json({ error: 'Name, price, and category are required' });
  }
  try {
    const id = parseInt(req.params.id);
    console.log('Updating item with ID:', id, 'Body:', req.body, 'File:', req.file);
    const [check] = await pool.query('SELECT id FROM menu_items WHERE id = ?', [id]);
    if (check.length === 0) {
      console.log('Item not found for ID:', id);
      return res.status(404).json({ error: 'Menu item not found' });
    }
    const [result] = await pool.query(
      'UPDATE menu_items SET name=?, description=?, price=?, category=?, image_url=?, available=? WHERE id=?',
      [name, description, parseFloat(price), category, image_url, parseInt(available), id]
    );
    if (result.affectedRows === 0) {
      console.log('No rows affected for ID:', id);
      return res.status(404).json({ error: 'Menu item not found' });
    }
    const [updatedItem] = await pool.query('SELECT * FROM menu_items WHERE id = ?', [id]);
    if (!updatedItem[0]) {
      console.log('Updated item not found for ID:', id);
      return res.status(404).json({ error: 'Menu item not found after update' });
    }
    console.log('Updated item:', updatedItem[0]);
    res.json(updatedItem[0]);
  } catch (err) {
    console.error('Error updating menu item:', err);
    res.status(500).json({ error: 'Failed to update menu item' });
  }
});

router.delete('/:id', auth, admin, async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    const [result] = await pool.query('DELETE FROM menu_items WHERE id=?', [id]);
    if (result.affectedRows === 0) {
      console.log('Item not found for deletion, ID:', id);
      return res.status(404).json({ error: 'Menu item not found' });
    }
    console.log('Deleted item with ID:', id);
    res.json({ message: 'Deleted' });
  } catch (err) {
    console.error('Error deleting menu item:', err);
    res.status(500).json({ error: 'Failed to delete menu item' });
  }
});

module.exports = router;