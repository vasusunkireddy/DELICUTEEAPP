const express = require('express');
const pool = require('../db');
const jwt = require('jsonwebtoken');

const router = express.Router();

// Middleware: Token Verification
const verifyToken = (req, res, next) => {
  const token = (req.headers.authorization || '').replace('Bearer ', '');
  if (!token) return res.status(401).json({ message: 'Auth token missing' });
  try {
    req.user = jwt.verify(token, process.env.JWT_SECRET);
    next();
  } catch {
    res.status(401).json({ message: 'Invalid or expired token' });
  }
};

// Helper: Format DB Row
const mapRow = (r) => ({
  id: r.id,
  code: r.code,
  description: r.description,
  type: r.type,
  value: Number(r.discount) || 0,
  min_qty: r.min_qty ? Number(r.min_qty) : null,
  category: r.category,
  start_date: r.start_date,
  end_date: r.end_date,
  image_url: r.image_url,
});

// GET /available-coupons
router.get('/', verifyToken, async (_req, res, next) => {
  try {
    const [rows] = await pool.query(
      `SELECT * FROM coupons
       WHERE (start_date IS NULL OR start_date <= CURDATE())
         AND (end_date IS NULL OR end_date >= CURDATE())
       ORDER BY id DESC`
    );
    const coupons = rows.map(mapRow);
    console.log('Available coupons:', coupons);
    res.json(coupons);
  } catch (err) {
    console.error('Available coupons error:', err);
    next(err);
  }
});

// POST /available-coupons/validate
router.post('/validate', verifyToken, async (req, res, next) => {
  try {
    const { code, cartItems = [] } = req.body;
    if (!code) return res.status(400).json({ valid: false, message: 'Code is required' });

    const [[row]] = await pool.query('SELECT * FROM coupons WHERE code = ?', [code.toUpperCase()]);
    if (!row) return res.json({ valid: false, message: 'Coupon not found' });

    const c = mapRow(row);
    console.log('Validating coupon:', c);
    const today = new Date();

    // Date check
    if (c.start_date && today < new Date(c.start_date))
      return res.json({ valid: false, message: 'Coupon not started yet' });
    if (c.end_date && today > new Date(c.end_date))
      return res.json({ valid: false, message: 'Coupon expired' });

    // Load cart items from DB if not sent
    let items = cartItems;
    if (!items.length) {
      const [rows] = await pool.query(
        `SELECT mi.category, ci.quantity
         FROM cart_items ci
         JOIN menu_items mi ON mi.id = ci.menu_item_id
         WHERE ci.user_id = ?`,
        [req.user.id]
      );
      items = rows.map((r) => ({
        category: r.category,
        qty: r.quantity,
      }));
    }

    const totalQty = items.reduce((sum, i) => sum + (i.qty ?? i.quantity ?? 1), 0);
    const categoryQty = items.reduce((map, i) => {
      const cat = (i.category || 'misc').toLowerCase();
      const qty = i.qty ?? i.quantity ?? 1;
      map[cat] = (map[cat] || 0) + qty;
      return map;
    }, {});

    // Validation by type
    switch (c.type) {
      case 'BUY_X':
        if (c.category) {
          const catQty = categoryQty[c.category.toLowerCase()] || 0;
          if (catQty < c.min_qty) {
            console.log('BUY_X invalid: insufficient category quantity', { catQty, min_qty: c.min_qty });
            return res.json({
              valid: false,
              message: `Add at least ${c.min_qty} item(s) in ${c.category}`,
            });
          }
        } else if (totalQty < c.min_qty) {
          console.log('BUY_X invalid: insufficient total quantity', { totalQty, min_qty: c.min_qty });
          return res.json({
            valid: false,
            message: `Add at least ${c.min_qty} item(s) to use this coupon`,
          });
        }
        break;

      case 'FIRST_ORDER': {
        const [[{ cnt }]] = await pool.query(
          'SELECT COUNT(*) AS cnt FROM orders WHERE user_id = ?',
          [req.user.id]
        );
        if (cnt > 0) {
          console.log('FIRST_ORDER invalid: user has prior orders', { cnt });
          return res.json({ valid: false, message: 'Coupon valid only on your first order' });
        }
        break;
      }

      case 'DATE_RANGE':
      case 'percent':
        // Date already validated
        break;

      default:
        console.log('Invalid coupon type:', c.type);
        return res.json({ valid: false, message: 'Unknown coupon type' });
    }

    console.log('Coupon validated successfully:', c);
    res.json({ valid: true, ...c });
  } catch (err) {
    console.error('Coupon validation error:', err);
    next(err);
  }
});

module.exports = router;