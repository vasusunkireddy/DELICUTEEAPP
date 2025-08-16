const express = require('express');
const jwt = require('jsonwebtoken');
const pool = require('../db');

const router = express.Router();

function verifyToken(req, res, next) {
  const token = (req.headers.authorization || '').replace('Bearer ', '');
  if (!token) return res.status(401).json({ message: 'Auth token missing' });
  try {
    req.user = jwt.verify(token, process.env.JWT_SECRET);
    next();
  } catch {
    res.status(401).json({ message: 'Invalid or expired token' });
  }
}
router.use(verifyToken);

router.post('/', async (req, res) => {
  try {
    const { menu_item_id, quantity } = req.body;
    if (!Number.isFinite(menu_item_id) || menu_item_id <= 0) {
      return res.status(400).json({ message: 'Invalid menu item ID' });
    }
    if (!Number.isFinite(quantity) || quantity <= 0) {
      return res.status(400).json({ message: 'Invalid quantity' });
    }

    // Validate menu item
    const [menuItem] = await pool.query(
      `SELECT id, name, price, image_url, is_active FROM menu_items WHERE id = ? AND is_active = 1 LIMIT 1`,
      [menu_item_id]
    );
    if (!menuItem.length) {
      return res.status(404).json({ message: 'Menu item not found' });
    }

    // Add to cart
    const [result] = await pool.query(
      `INSERT INTO cart (user_id, menu_item_id, quantity, price, name, image_url)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [
        req.user.id,
        menu_item_id,
        quantity,
        menuItem[0].price,
        menuItem[0].name,
        menuItem[0].image_url || null,
      ]
    );

    res.status(201).json({ id: result.insertId, menu_item_id, quantity });
  } catch (err) {
    console.error('[cart.js] Add to cart error:', err);
    res.status(500).json({ message: 'Internal server error' });
  }
});

router.delete('/', async (req, res) => {
  try {
    await pool.query(`DELETE FROM cart WHERE user_id = ?`, [req.user.id]);
    res.json({ ok: true });
  } catch (err) {
    console.error('[cart.js] Clear cart error:', err);
    res.status(500).json({ message: 'Internal server error' });
  }
});

module.exports = router;