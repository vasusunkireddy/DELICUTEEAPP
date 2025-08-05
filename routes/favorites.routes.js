// routes/favorites.routes.js

const express = require('express');
const router = express.Router();
const db = require('../db'); // MySQL pool connection
const auth = require('../middleware/auth'); // JWT auth middleware

// GET /api/favorites - Fetch all favorite menu items for the logged-in user
router.get('/', auth, async (req, res) => {
  const userId = req.user.id;
  try {
    const [rows] = await db.query(
      `SELECT m.* FROM favorites f
       JOIN menu_items m ON f.menu_item_id = m.id
       WHERE f.user_id = ?`,
      [userId]
    );
    res.json(rows);
  } catch (err) {
    console.error('Error fetching favorites:', err);
    res.status(500).json({ message: 'Failed to fetch favorites' });
  }
});

// POST /api/favorites - Add a menu item to the user's favorites
router.post('/', auth, async (req, res) => {
  const userId = req.user.id;
  const { menu_item_id } = req.body;

  if (!menu_item_id) {
    return res.status(400).json({ message: 'menu_item_id is required' });
  }

  try {
    await db.query(
      `INSERT IGNORE INTO favorites (user_id, menu_item_id) VALUES (?, ?)`,
      [userId, menu_item_id]
    );
    res.status(201).json({ message: 'Added to favorites' });
  } catch (err) {
    console.error('Error adding to favorites:', err);
    res.status(500).json({ message: 'Failed to add to favorites' });
  }
});

// DELETE /api/favorites/:itemId - Remove a menu item from the user's favorites
router.delete('/:itemId', auth, async (req, res) => {
  const userId = req.user.id;
  const itemId = req.params.itemId;

  try {
    await db.query(
      `DELETE FROM favorites WHERE user_id = ? AND menu_item_id = ?`,
      [userId, itemId]
    );
    res.json({ message: 'Removed from favorites' });
  } catch (err) {
    console.error('Error removing from favorites:', err);
    res.status(500).json({ message: 'Failed to remove from favorites' });
  }
});

module.exports = router;
