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

// Change this to `true` if your DB columns are DATETIME
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

/* ─── ADMIN: get all coupons ─── */
router.get('/', auth, admin, async (_req, res, next) => {
  try {
    const [rows] = await pool.query('SELECT * FROM coupons ORDER BY id DESC');
    res.json(rows);
  } catch (err) {
    next(err);
  }
});

/* ─── ADMIN: create new coupon ─── */
router.post('/', auth, admin, async (req, res, next) => {
  try {
    const {
      code,
      description,
      type,
      discount,
      min_qty,
      category_id,
      start_date,
      end_date,
      image,
      buy_qty,
      free_qty,
      subcategory,
      product,
    } = req.body;

    if (!code) return res.status(400).json({ message: 'Coupon code is required' });
    if (!type || !['BUY_X', 'FIRST_ORDER', 'DATE_RANGE', 'BUY_X_GET_Y'].includes(type)) {
      return res.status(400).json({ message: 'Invalid coupon type' });
    }
    if (type === 'BUY_X') {
      if (!min_qty || !category_id) {
        return res.status(400).json({ message: 'Min quantity and category ID required for BUY_X' });
      }
      if (isNaN(min_qty) || min_qty <= 0) {
        return res.status(400).json({ message: 'Min quantity must be a positive number' });
      }
    }
    if (type === 'BUY_X_GET_Y') {
      if (!buy_qty || !free_qty || !category_id) {
        return res.status(400).json({ message: 'Buy quantity, free quantity, and category ID required for BUY_X_GET_Y' });
      }
      if (isNaN(buy_qty) || buy_qty <= 0 || isNaN(free_qty) || free_qty <= 0) {
        return res.status(400).json({ message: 'Buy and free quantities must be positive numbers' });
      }
    }
    if (type !== 'BUY_X_GET_Y' && (discount === undefined || discount === null || isNaN(discount) || discount < 0)) {
      return res.status(400).json({ message: 'Valid discount percentage required for non-BUY_X_GET_Y types' });
    }
    if (category_id) {
      const [category] = await pool.query('SELECT id FROM categories WHERE id = ?', [category_id]);
      if (category.length === 0) {
        return res.status(400).json({ message: 'Invalid category ID' });
      }
    }
    if (start_date && end_date && new Date(start_date) > new Date(end_date)) {
      return res.status(400).json({ message: 'End date must be after start date' });
    }

    const [existing] = await pool.query('SELECT id FROM coupons WHERE code = ?', [code]);
    if (existing.length > 0) {
      return res.status(400).json({ message: 'Coupon code already exists' });
    }

    const [result] = await pool.query(
      `INSERT INTO coupons
       (code, description, type, discount, min_qty, category_id, start_date, end_date, image_url,
        buy_qty, free_qty, subcategory, product)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,

      [
        code,
        description || null,
        type,
        type === 'BUY_X_GET_Y' ? null : discount,
        type === 'BUY_X' ? min_qty : null,
        ['BUY_X', 'BUY_X_GET_Y'].includes(type) ? category_id : null,
        formatDate(start_date),
        formatDate(end_date),
        image || null,
        type === 'BUY_X_GET_Y' ? buy_qty : null,
        type === 'BUY_X_GET_Y' ? free_qty : null,
        type === 'BUY_X_GET_Y' ? subcategory : null,
        type === 'BUY_X_GET_Y' ? product : null,
      ]
    );

    const [newCoupon] = await pool.query('SELECT * FROM coupons WHERE id = ?', [result.insertId]);
    res.status(201).json(newCoupon[0]);
  } catch (err) {
    next(err);
  }
});

/* ─── ADMIN: update existing coupon ─── */
router.put('/:id', auth, admin, async (req, res, next) => {
  try {
    const {
      code,
      description,
      type,
      discount,
      min_qty,
      category_id,
      start_date,
      end_date,
      image,
      buy_qty,
      free_qty,
      subcategory,
      product,
    } = req.body;

    if (!code) return res.status(400).json({ message: 'Coupon code is required' });
    if (!type || !['BUY_X', 'FIRST_ORDER', 'DATE_RANGE', 'BUY_X_GET_Y'].includes(type)) {
      return res.status(400).json({ message: 'Invalid coupon type' });
    }
    if (type === 'BUY_X') {
      if (!min_qty || !category_id) {
        return res.status(400).json({ message: 'Min quantity and category ID required for BUY_X' });
      }
      if (isNaN(min_qty) || min_qty <= 0) {
        return res.status(400).json({ message: 'Min quantity must be a positive number' });
      }
    }
    if (type === 'BUY_X_GET_Y') {
      if (!buy_qty || !free_qty || !category_id) {
        return res.status(400).json({ message: 'Buy quantity, free quantity, and category ID required for BUY_X_GET_Y' });
      }
      if (isNaN(buy_qty) || buy_qty <= 0 || isNaN(free_qty) || free_qty <= 0) {
        return res.status(400).json({ message: 'Buy and free quantities must be positive numbers' });
      }
    }
    if (type !== 'BUY_X_GET_Y' && (discount === undefined || discount === null || isNaN(discount) || discount < 0)) {
      return res.status(400).json({ message: 'Valid discount percentage required for non-BUY_X_GET_Y types' });
    }
    if (category_id) {
      const [category] = await pool.query('SELECT id FROM categories WHERE id = ?', [category_id]);
      if (category.length === 0) {
        return res.status(400).json({ message: 'Invalid category ID' });
      }
    }
    if (start_date && end_date && new Date(start_date) > new Date(end_date)) {
      return res.status(400).json({ message: 'End date must be after start date' });
    }

    const [existing] = await pool.query('SELECT id FROM coupons WHERE code = ? AND id != ?', [code, req.params.id]);
    if (existing.length > 0) {
      return res.status(400).json({ message: 'Coupon code already exists' });
    }

    const [result] = await pool.query(
      `UPDATE coupons SET
        code        = ?,
        description = ?,
        type        = ?,
        discount    = ?,
        min_qty     = ?,
        category_id = ?,
        start_date  = ?,
        end_date    = ?,
        image_url   = ?,
        buy_qty     = ?,
        free_qty    = ?,
        subcategory = ?,
        product     = ?
       WHERE id = ?`,

      [
        code,
        description || null,
        type,
        type === 'BUY_X_GET_Y' ? null : discount,
        type === 'BUY_X' ? min_qty : null,
        ['BUY_X', 'BUY_X_GET_Y'].includes(type) ? category_id : null,
        formatDate(start_date),
        formatDate(end_date),
        image || null,
        type === 'BUY_X_GET_Y' ? buy_qty : null,
        type === 'BUY_X_GET_Y' ? free_qty : null,
        type === 'BUY_X_GET_Y' ? subcategory : null,
        type === 'BUY_X_GET_Y' ? product : null,
        req.params.id,
      ]
    );

    if (result.affectedRows === 0) {
      return res.status(404).json({ message: 'Coupon not found' });
    }

    const [updatedCoupon] = await pool.query('SELECT * FROM coupons WHERE id = ?', [req.params.id]);
    res.json(updatedCoupon[0]);
  } catch (err) {
    next(err);
  }
});

/* ─── ADMIN: delete coupon ─── */
router.delete('/:id', auth, admin, async (req, res, next) => {
  try {
    const [result] = await pool.query('DELETE FROM coupons WHERE id = ?', [req.params.id]);

    if (result.affectedRows === 0) {
      return res.status(404).json({ message: 'Coupon not found' });
    }

    res.json({ message: 'Coupon deleted' });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
