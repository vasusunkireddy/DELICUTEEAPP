const express = require('express');
const pool = require('../db');
const auth = require('../middleware/auth');
const admin = require('../middleware/admin');

const router = express.Router();

/* ─── Helper: Format Dates for MySQL ─── */
function formatDateToMySQL(date) {
  if (!date) return null;
  const d = new Date(date);
  if (isNaN(d)) return null;
  return d.toISOString().slice(0, 10); // YYYY-MM-DD
}

function formatDateTimeToMySQL(date) {
  if (!date) return null;
  const d = new Date(date);
  if (isNaN(d)) return null;
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')} ` +
         `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}:${String(d.getSeconds()).padStart(2, '0')}`;
}

// Change to `true` if your DB columns are DATETIME
const USE_DATETIME = false; 
function formatDate(date) {
  return USE_DATETIME ? formatDateTimeToMySQL(date) : formatDateToMySQL(date);
}

/* ─── ADMIN: get all categories ─── */
router.get('/categories', auth, admin, async (_req, res, next) => {
  try {
    const [rows] = await pool.query('SELECT id, name FROM categories ORDER BY name');
    res.json(rows);
  } catch (err) {
    next(err);
  }
});

/* ─── ADMIN: get all FIRST_ORDER coupons ─── */
router.get('/', auth, admin, async (_req, res, next) => {
  try {
    const [rows] = await pool.query('SELECT * FROM coupons WHERE type = ? ORDER BY id DESC', ['FIRST_ORDER']);
    res.json(rows);
  } catch (err) {
    next(err);
  }
});

/* ─── ADMIN: create new FIRST_ORDER coupon ─── */
router.post('/', auth, admin, async (req, res, next) => {
  try {
    const { code, description, discount, start_date, end_date, image } = req.body;

    if (!code) return res.status(400).json({ message: 'Coupon code is required' });
    if (discount === undefined || discount === null || isNaN(discount) || discount < 0) {
      return res.status(400).json({ message: 'Valid discount percentage required' });
    }
    if (start_date && end_date && new Date(start_date) > new Date(end_date)) {
      return res.status(400).json({ message: 'End date must be after start date' });
    }

    const [existing] = await pool.query('SELECT id FROM coupons WHERE code = ?', [code]);
    if (existing.length > 0) return res.status(400).json({ message: 'Coupon code already exists' });

    const [result] = await pool.query(
      `INSERT INTO coupons (code, description, type, discount, start_date, end_date, image_url)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [code, description || null, 'FIRST_ORDER', discount, formatDate(start_date), formatDate(end_date), image || null]
    );

    const [newCoupon] = await pool.query('SELECT * FROM coupons WHERE id = ?', [result.insertId]);
    res.status(201).json(newCoupon[0]);
  } catch (err) {
    next(err);
  }
});

/* ─── ADMIN: update existing FIRST_ORDER coupon ─── */
router.put('/:id', auth, admin, async (req, res, next) => {
  try {
    const { code, description, discount, start_date, end_date, image } = req.body;

    if (!code) return res.status(400).json({ message: 'Coupon code is required' });
    if (discount === undefined || discount === null || isNaN(discount) || discount < 0) {
      return res.status(400).json({ message: 'Valid discount percentage required' });
    }
    if (start_date && end_date && new Date(start_date) > new Date(end_date)) {
      return res.status(400).json({ message: 'End date must be after start date' });
    }

    const [existing] = await pool.query('SELECT id FROM coupons WHERE code = ? AND id != ?', [code, req.params.id]);
    if (existing.length > 0) return res.status(400).json({ message: 'Coupon code already exists' });

    const [result] = await pool.query(
      `UPDATE coupons SET code = ?, description = ?, discount = ?, start_date = ?, end_date = ?, image_url = ?
       WHERE id = ? AND type = ?`,
      [code, description || null, discount, formatDate(start_date), formatDate(end_date), image || null, req.params.id, 'FIRST_ORDER']
    );

    if (result.affectedRows === 0) return res.status(404).json({ message: 'Coupon not found' });

    const [updatedCoupon] = await pool.query('SELECT * FROM coupons WHERE id = ?', [req.params.id]);
    res.json(updatedCoupon[0]);
  } catch (err) {
    next(err);
  }
});

/* ─── ADMIN: delete FIRST_ORDER coupon ─── */
router.delete('/:id', auth, admin, async (req, res, next) => {
  try {
    const [result] = await pool.query('DELETE FROM coupons WHERE id = ? AND type = ?', [req.params.id, 'FIRST_ORDER']);

    if (result.affectedRows === 0) return res.status(404).json({ message: 'Coupon not found' });

    res.json({ message: 'Coupon deleted' });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
