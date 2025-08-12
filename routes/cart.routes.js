const express = require('express');
const jwt = require('jsonwebtoken');
const pool = require('../db');

const router = express.Router();

/** ----------------------- AUTH ----------------------- */
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

/** ----------------------- HELPERS ----------------------- */
const toInt = (v) => {
  const n = Number(v);
  return Number.isFinite(n) ? Math.trunc(n) : NaN;
};

async function ensureMenuItemExists(id) {
  // Adjust the WHERE as per your schema (active/in_stock)
  const [rows] = await pool.query(
    `SELECT id FROM menu_items WHERE id = ? LIMIT 1`,
    [id]
  );
  return rows.length > 0;
}

async function getCartSummary(userId, couponCode) {
  const [[settings]] = await pool.query(
    `SELECT delivery_fee FROM settings LIMIT 1`
  );
  const deliveryFee = Number(settings?.delivery_fee) || 0;

  const [items] = await pool.query(
    `SELECT ci.menu_item_id,
            ci.quantity,
            mi.name,
            mi.price,
            mi.image_url,
            mi.category,
            (ci.quantity * mi.price) AS total_price
     FROM cart_items ci
     JOIN menu_items mi ON mi.id = ci.menu_item_id
     WHERE ci.user_id = ?`,
    [userId]
  );

  const subtotal = items.reduce((sum, i) => sum + (Number(i.total_price) || 0), 0);

  let coupon = null;
  let discount = 0;
  const code = (couponCode || '').trim().toUpperCase();

  if (code) {
    const [[c]] = await pool.query(
      `SELECT * FROM coupons
         WHERE code = ?
           AND (start_date IS NULL OR NOW() >= start_date)
           AND (end_date   IS NULL OR NOW() <= end_date)
       LIMIT 1`,
      [code]
    );
    if (c) {
      coupon = { code: c.code, type: c.type, value: Number(c.discount) || 0 };
      switch (c.type) {
        case 'percent':
          discount = Number(((subtotal * c.discount) / 100).toFixed(2));
          break;
        case 'BUY_X': {
          const count = c.category
            ? items.filter(i => i.category === c.category).reduce((s, i) => s + Number(i.quantity), 0)
            : items.reduce((s, i) => s + Number(i.quantity), 0);
          if (count >= c.min_qty) discount = Number(c.discount) || 0;
          else coupon = null;
          break;
        }
        case 'FIRST_ORDER': {
          const [[{ cnt }]] = await pool.query(
            'SELECT COUNT(*) AS cnt FROM orders WHERE user_id = ?',
            [userId]
          );
          if (cnt === 0) discount = Number(c.discount) || 0;
          else coupon = null;
          break;
        }
        case 'DATE_RANGE':
          discount = Number(c.discount) || 0;
          break;
        default:
          coupon = null;
      }
    }
  }

  const total = Number((subtotal - discount + (items.length ? deliveryFee : 0)).toFixed(2));

  return {
    items,
    subtotal: Number(subtotal.toFixed(2)),
    delivery_fee: deliveryFee,
    discount,
    coupon,
    total,
  };
}

/** ----------------------- ROUTES ----------------------- */

// Add or update cart item (set qty)
router.post('/', async (req, res, next) => {
  try {
    const userId = req.user.id;
    const itemId = toInt(req.body.menu_item_id);
    const qty = toInt(req.body.quantity ?? 1);

    if (!Number.isInteger(itemId) || itemId <= 0 || !Number.isInteger(qty) || qty < 1) {
      return res.status(400).json({ message: 'menu_item_id and quantity (>=1) are required' });
    }

    // ✅ Prevent FK error: ensure parent exists
    const exists = await ensureMenuItemExists(itemId);
    if (!exists) {
      return res.status(404).json({ message: 'Menu item not found' });
    }

    // ✅ Upsert with a unique (user_id, menu_item_id) constraint
    await pool.query(
      `INSERT INTO cart_items (user_id, menu_item_id, quantity)
       VALUES (?, ?, ?)
       ON DUPLICATE KEY UPDATE quantity = VALUES(quantity)`,
      [userId, itemId, qty]
    );

    // Optional: return summary so UI stays in sync
    const summary = await getCartSummary(userId, req.query?.coupon);
    return res.json({ ok: true, cart: summary });
  } catch (err) {
    console.error('[cart.js] Add/update error:', err);
    // Translate common FK error explicitly
    if (err?.code === 'ER_NO_REFERENCED_ROW_2') {
      return res.status(400).json({ message: 'Invalid menu_item_id (not found in menu_items)' });
    }
    next(err);
  }
});

// Change / remove quantity
async function updateItem(req, res, next) {
  try {
    const userId = req.user.id;
    const itemId = toInt(req.params.itemId);
    const qty = toInt(req.body.quantity);

    if (!Number.isInteger(itemId) || itemId <= 0) {
      return res.status(400).json({ message: 'Invalid itemId' });
    }
    if (!Number.isInteger(qty)) {
      return res.status(400).json({ message: 'quantity required' });
    }

    if (qty <= 0) {
      await pool.query(
        `DELETE FROM cart_items WHERE user_id = ? AND menu_item_id = ?`,
        [userId, itemId]
      );
      const summary = await getCartSummary(userId, req.query?.coupon);
      return res.json({ removed: true, cart: summary });
    }

    // Ensure parent exists (avoids confusing 0-row updates)
    const exists = await ensureMenuItemExists(itemId);
    if (!exists) return res.status(404).json({ message: 'Menu item not found' });

    const [r] = await pool.query(
      `UPDATE cart_items SET quantity = ? WHERE user_id = ? AND menu_item_id = ?`,
      [qty, userId, itemId]
    );

    if (r.affectedRows === 0) {
      // If item wasn’t in the cart, add it (quality-of-life)
      await pool.query(
        `INSERT INTO cart_items (user_id, menu_item_id, quantity) VALUES (?, ?, ?)`,
        [userId, itemId, qty]
      );
    }

    const summary = await getCartSummary(userId, req.query?.coupon);
    res.json({ ok: true, cart: summary });
  } catch (err) {
    console.error('[cart.js] Update error:', err);
    next(err);
  }
}
router.patch('/:itemId', updateItem);
router.put('/:itemId', updateItem);

// Delete cart item
router.delete('/:itemId', async (req, res, next) => {
  try {
    const userId = req.user.id;
    const itemId = toInt(req.params.itemId);
    if (!Number.isInteger(itemId) || itemId <= 0) {
      return res.status(400).json({ message: 'Invalid itemId' });
    }

    await pool.query(
      `DELETE FROM cart_items WHERE user_id = ? AND menu_item_id = ?`,
      [userId, itemId]
    );

    const summary = await getCartSummary(userId, req.query?.coupon);
    res.json({ ok: true, cart: summary });
  } catch (err) {
    console.error('[cart.js] Delete error:', err);
    next(err);
  }
});

// Get full cart
router.get('/', async (req, res, next) => {
  try {
    const summary = await getCartSummary(req.user.id, req.query.coupon);
    res.json(summary);
  } catch (err) {
    console.error('[cart.js] Fetch error:', err);
    next(err);
  }
});

module.exports = router;
