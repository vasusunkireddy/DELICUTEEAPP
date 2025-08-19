// routes/cart.routes.js
const express = require('express');
const jwt = require('jsonwebtoken');
const pool = require('../db');

const router = express.Router();

/* ------------------------ Auth Middleware ------------------------ */
function verifyToken(req, res, next) {
  // Support both Bearer header and cookie (JWT in cookie named "token")
  let token = (req.headers.authorization || '').replace(/^Bearer\s+/i, '');
  if (!token && req.cookies) token = req.cookies.token;
  if (!token) return res.status(401).json({ message: 'Auth token missing' });

  try {
    const payload = jwt.verify(token, process.env.JWT_SECRET);
    req.user = { id: payload.id, role: payload.role };
    next();
  } catch (e) {
    return res.status(401).json({ message: 'Invalid or expired token' });
  }
}
router.use(verifyToken);

/* ------------------------ Helpers ------------------------ */
function toInt(val, def = null) {
  const n = Number.parseInt(val, 10);
  return Number.isFinite(n) ? n : def;
}

function toFloat(val, def = null) {
  const n = Number.parseFloat(val);
  return Number.isFinite(n) ? n : def;
}

function calcTotals(rows) {
  const subtotal = rows.reduce((s, r) => s + (Number(r.price) || 0) * (r.quantity || 0), 0);
  // Hook for coupon/taxes later
  const discount = 0;
  const tax = 0;
  const total = subtotal - discount + tax;
  return { subtotal, discount, tax, total };
}

/* ------------------------ GET /cart ------------------------ */
// List user's cart
router.get('/', async (req, res) => {
  try {
    const [rows] = await pool.query(
      `SELECT c.menu_item_id, c.quantity, c.price, c.name, c.image_url
       FROM cart c
       WHERE c.user_id = ?`,
      [req.user.id]
    );
    const totals = calcTotals(rows);
    return res.json({ items: rows, ...totals });
  } catch (err) {
    console.error('[cart] GET error:', err);
    return res.status(500).json({ message: 'Internal server error' });
  }
});

/* ------------------------ POST /cart ------------------------ */
// Add to cart (UPSERT/increment)
router.post('/', async (req, res) => {
  try {
    const menu_item_id = toInt(req.body.menu_item_id);
    const quantity = toInt(req.body.quantity);

    if (!menu_item_id || menu_item_id <= 0) {
      return res.status(400).json({ message: 'Invalid menu item ID' });
    }
    if (!quantity || quantity <= 0) {
      return res.status(400).json({ message: 'Invalid quantity' });
    }

    // Validate menu item is active
    const [miRows] = await pool.query(
      `SELECT id, name, price, image_url
         FROM menu_items
        WHERE id = ? AND is_active = 1
        LIMIT 1`,
      [menu_item_id]
    );
    if (!miRows.length) {
      return res.status(404).json({ message: 'Menu item not found or inactive' });
    }
    const mi = miRows[0];

    // UPSERT: if line exists, increment; else insert
    const conn = await pool.getConnection();
    try {
      await conn.beginTransaction();

      const [existsRows] = await conn.query(
        `SELECT quantity FROM cart WHERE user_id = ? AND menu_item_id = ? LIMIT 1`,
        [req.user.id, menu_item_id]
      );

      if (existsRows.length) {
        await conn.query(
          `UPDATE cart
              SET quantity = quantity + ?
            WHERE user_id = ? AND menu_item_id = ?`,
          [quantity, req.user.id, menu_item_id]
        );
      } else {
        await conn.query(
          `INSERT INTO cart (user_id, menu_item_id, quantity, price, name, image_url)
           VALUES (?, ?, ?, ?, ?, ?)`,
          [req.user.id, menu_item_id, quantity, mi.price, mi.name, mi.image_url || null]
        );
      }

      await conn.commit();
      conn.release();
    } catch (e) {
      await conn.rollback();
      conn.release();
      throw e;
    }

    // Return updated cart
    const [rows] = await pool.query(
      `SELECT c.menu_item_id, c.quantity, c.price, c.name, c.image_url
         FROM cart c
        WHERE c.user_id = ?`,
      [req.user.id]
    );
    const totals = calcTotals(rows);
    return res.status(201).json({ items: rows, ...totals });
  } catch (err) {
    console.error('[cart] POST error:', err);
    return res.status(500).json({ message: 'Internal server error' });
  }
});

/* ------------------------ PATCH /cart/:menu_item_id ------------------------ */
// Set quantity exactly (>=1). If qty==0, delete line.
router.patch('/:menu_item_id', async (req, res) => {
  try {
    const menu_item_id = toInt(req.params.menu_item_id);
    const quantity = toInt(req.body.quantity);

    if (!menu_item_id || menu_item_id <= 0) {
      return res.status(400).json({ message: 'Invalid menu item ID' });
    }
    if (quantity == null || quantity < 0) {
      return res.status(400).json({ message: 'Invalid quantity' });
    }

    if (quantity === 0) {
      await pool.query(
        `DELETE FROM cart WHERE user_id = ? AND menu_item_id = ?`,
        [req.user.id, menu_item_id]
      );
    } else {
      const [r] = await pool.query(
        `UPDATE cart
            SET quantity = ?
          WHERE user_id = ? AND menu_item_id = ?`,
        [quantity, req.user.id, menu_item_id]
      );
      if (!r.affectedRows) {
        return res.status(404).json({ message: 'Cart line not found' });
      }
    }

    const [rows] = await pool.query(
      `SELECT c.menu_item_id, c.quantity, c.price, c.name, c.image_url
         FROM cart c
        WHERE c.user_id = ?`,
      [req.user.id]
    );
    const totals = calcTotals(rows);
    return res.json({ items: rows, ...totals });
  } catch (err) {
    console.error('[cart] PATCH error:', err);
    return res.status(500).json({ message: 'Internal server error' });
  }
});

/* ------------------------ DELETE /cart/:menu_item_id ------------------------ */
// Remove one item from cart
router.delete('/:menu_item_id', async (req, res) => {
  try {
    const menu_item_id = toInt(req.params.menu_item_id);
    if (!menu_item_id || menu_item_id <= 0) {
      return res.status(400).json({ message: 'Invalid menu item ID' });
    }

    const [r] = await pool.query(
      `DELETE FROM cart WHERE user_id = ? AND menu_item_id = ?`,
      [req.user.id, menu_item_id]
    );
    if (!r.affectedRows) {
      return res.status(404).json({ message: 'Cart line not found' });
    }

    const [rows] = await pool.query(
      `SELECT c.menu_item_id, c.quantity, c.price, c.name, c.image_url
         FROM cart c
        WHERE c.user_id = ?`,
      [req.user.id]
    );
    const totals = calcTotals(rows);
    return res.json({ items: rows, ...totals });
  } catch (err) {
    console.error('[cart] DELETE one error:', err);
    return res.status(500).json({ message: 'Internal server error' });
  }
});

/* ------------------------ DELETE /cart ------------------------ */
// Clear entire cart
router.delete('/', async (req, res) => {
  try {
    await pool.query(`DELETE FROM cart WHERE user_id = ?`, [req.user.id]);
    return res.json({ ok: true, items: [], subtotal: 0, discount: 0, tax: 0, total: 0 });
  } catch (err) {
    console.error('[cart] Clear cart error:', err);
    return res.status(500).json({ message: 'Internal server error' });
  }
});

module.exports = router;
