// routes/menubrowse.routes.js
const express = require('express');
const jwt = require('jsonwebtoken');
const pool = require('../db');

const router = express.Router();

/* ✅ Middleware: Token verification */
const verifyToken = (req, res, next) => {
  const token = (req.headers.authorization || '').replace('Bearer ', '');
  if (!token) return res.status(401).json({ message: 'Auth token missing' });

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    req.user = decoded;
    next();
  } catch (err) {
    return res.status(401).json({ message: 'Invalid or expired token' });
  }
};

/* ✅ GET all menu items (public) */
router.get('/', async (req, res, next) => {
  try {
    const [rows] = await pool.query(
      `SELECT id, name, description, price, image_url, category
       FROM menu_items
       WHERE enabled = 1
       ORDER BY id DESC`
    );
    res.json(rows);
  } catch (err) {
    next(err);
  }
});

/* ✅ GET single menu item (public) */
router.get('/:id', async (req, res, next) => {
  try {
    const [[item]] = await pool.query(
      `SELECT id, name, description, price, image_url, category
       FROM menu_items
       WHERE id = ? AND enabled = 1`,
      [req.params.id]
    );
    if (!item) return res.status(404).json({ message: 'Item not found' });
    res.json(item);
  } catch (err) {
    next(err);
  }
});

/* ✅ POST to cart (secure) */
router.post('/', verifyToken, async (req, res, next) => {
  try {
    const itemId = req.body.menu_item_id ?? req.body.item_id;
    const qty = Number(req.body.quantity ?? req.body.qty ?? 1);

    if (!itemId || qty < 1) {
      return res.status(400).json({ message: 'menu_item_id and quantity ≥ 1 required' });
    }

    await pool.query(
      `INSERT INTO cart_items (user_id, menu_item_id, quantity)
       VALUES (?, ?, ?)
       ON DUPLICATE KEY UPDATE quantity = quantity + VALUES(quantity)`,
      [req.user.id, itemId, qty]
    );

    res.json({ ok: true, added: qty, item_id: itemId });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
