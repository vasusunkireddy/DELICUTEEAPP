const express = require('express');
const jwt = require('jsonwebtoken');
const pool = require('../db');

const router = express.Router();

// ✅ Auth middleware
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

// ✅ Add or update cart item
router.post('/', async (req, res, next) => {
  try {
    const itemId = req.body.menu_item_id;
    const qty = Number(req.body.quantity ?? 1);

    if (!itemId || qty < 1) {
      return res.status(400).json({ message: 'menu_item_id and quantity ≥ 1 required' });
    }

    const [exists] = await pool.query(
      `SELECT 1 FROM cart_items WHERE user_id = ? AND menu_item_id = ?`,
      [req.user.id, itemId]
    );

    if (exists.length) {
      await pool.query(
        `UPDATE cart_items SET quantity = ? WHERE user_id = ? AND menu_item_id = ?`,
        [qty, req.user.id, itemId]
      );
    } else {
      await pool.query(
        `INSERT INTO cart_items (user_id, menu_item_id, quantity) VALUES (?, ?, ?)`,
        [req.user.id, itemId, qty]
      );
    }

    res.json({ ok: true });
  } catch (err) {
    console.error('[cart.js] Add/update error:', err);
    next(err);
  }
});

// ✅ Change / remove quantity
async function updateItem(req, res, next) {
  try {
    const qty = Number(req.body.quantity);
    if (Number.isNaN(qty)) return res.status(400).json({ message: 'quantity required' });

    if (qty <= 0) {
      await pool.query(
        `DELETE FROM cart_items WHERE user_id = ? AND menu_item_id = ?`,
        [req.user.id, req.params.itemId]
      );
      return res.json({ removed: true });
    }

    await pool.query(
      `UPDATE cart_items SET quantity = ? WHERE user_id = ? AND menu_item_id = ?`,
      [qty, req.user.id, req.params.itemId]
    );
    res.json({ ok: true });
  } catch (err) {
    console.error('[cart.js] Update error:', err);
    next(err);
  }
}
router.patch('/:itemId', updateItem);
router.put('/:itemId', updateItem);

// ✅ Delete cart item
router.delete('/:itemId', async (req, res, next) => {
  try {
    await pool.query(
      `DELETE FROM cart_items WHERE user_id = ? AND menu_item_id = ?`,
      [req.user.id, req.params.itemId]
    );
    res.json({ ok: true });
  } catch (err) {
    console.error('[cart.js] Delete error:', err);
    next(err);
  }
});

// ✅ Get full cart
router.get('/', async (req, res, next) => {
  try {
    console.log('[cart.js] Received coupon query:', req.query.coupon);

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
      [req.user.id]
    );

    const subtotal = items.reduce((sum, i) => sum + (Number(i.total_price) || 0), 0);

    // Coupon Logic
    let coupon = null;
    let discount = 0;
    const code = (req.query.coupon || '').trim().toUpperCase();

    if (code) {
      const [[c]] = await pool.query(
        `SELECT * FROM coupons
         WHERE code = ?
           AND (start_date IS NULL OR NOW() >= start_date)
           AND (end_date IS NULL OR NOW() <= end_date)`,
        [code]
      );
      if (c) {
        coupon = { code: c.code, type: c.type, value: Number(c.discount) || 0 };
        switch (c.type) {
          case 'percent':
            discount = Number(((subtotal * c.discount) / 100).toFixed(2));
            break;
          case 'BUY_X':
            const count = c.category
              ? items.filter(i => i.category === c.category).reduce((s, i) => s + Number(i.quantity), 0)
              : items.reduce((s, i) => s + Number(i.quantity), 0);
            if (count >= c.min_qty) discount = Number(c.discount) || 0;
            else coupon = null;
            break;
          case 'FIRST_ORDER':
            const [[{ cnt }]] = await pool.query(
              'SELECT COUNT(*) AS cnt FROM orders WHERE user_id = ?',
              [req.user.id]
            );
            if (cnt === 0) discount = Number(c.discount) || 0;
            else coupon = null;
            break;
          case 'DATE_RANGE':
            discount = Number(c.discount) || 0;
            break;
          default:
            coupon = null;
        }
      }
    }

    const total = Number((subtotal - discount + (items.length ? deliveryFee : 0)).toFixed(2));

    res.json({
      items,
      subtotal: Number(subtotal.toFixed(2)),
      delivery_fee: deliveryFee,
      discount,
      coupon,
      total,
    });
  } catch (err) {
    console.error('[cart.js] Fetch error:', err);
    next(err);
  }
});

module.exports = router;
