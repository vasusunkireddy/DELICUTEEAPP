// routes/menubrowse.routes.js
const express = require('express');
const jwt = require('jsonwebtoken');
const pool = require('../db');

const router = express.Router();

/* ✅ Middleware: Token verification (for POST to cart) */
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

/* ✅ GET all customer-visible items WITH ratings
   (Removed `WHERE m.enabled = 1` because your schema doesn't have that column) */
router.get('/', async (_req, res, next) => {
  try {
    const [rows] = await pool.query(
      `
      SELECT
        m.id,
        m.name,
        m.description,
        m.price,
        m.image_url,
        m.category,
        ROUND(AVG(oi.rating), 1) AS rating_avg,
        COUNT(oi.rating)         AS rating_count
      FROM menu_items m
      LEFT JOIN order_items oi
        ON oi.product_id = m.id
       AND oi.rating IS NOT NULL
      GROUP BY m.id
      ORDER BY m.id DESC
      `
    );
    res.json(rows);
  } catch (err) {
    next(err);
  }
});

/* ✅ GET single item WITH ratings (no `enabled` filter) */
router.get('/:id', async (req, res, next) => {
  try {
    const [[item]] = await pool.query(
      `
      SELECT
        m.id,
        m.name,
        m.description,
        m.price,
        m.image_url,
        m.category,
        ROUND(AVG(oi.rating), 1) AS rating_avg,
        COUNT(oi.rating)         AS rating_count
      FROM menu_items m
      LEFT JOIN order_items oi
        ON oi.product_id = m.id
       AND oi.rating IS NOT NULL
      WHERE m.id = ?
      GROUP BY m.id
      `,
      [req.params.id]
    );
    if (!item) return res.status(404).json({ message: 'Item not found' });
    res.json(item);
  } catch (err) {
    next(err);
  }
});

/* ✅ POST to cart (secure) — unchanged */
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
