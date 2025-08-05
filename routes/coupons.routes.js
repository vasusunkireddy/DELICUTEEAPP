const express = require('express');
const pool = require('../db');
const auth = require('../middleware/auth');
const admin = require('../middleware/admin');

const router = express.Router();

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
      category,
      startDate,
      endDate,
      image,
    } = req.body;

    await pool.query(
      `INSERT INTO coupons
       (code, description, type, discount, min_qty, category, start_date, end_date, image_url)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        code,
        description,
        type,
        discount,
        min_qty || null,
        category || null,
        startDate || null,
        endDate || null,
        image || null,
      ]
    );

    res.status(201).json({ message: 'Coupon created' });
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
      category,
      startDate,
      endDate,
      image,
    } = req.body;

    const [result] = await pool.query(
      `UPDATE coupons SET
        code        = ?,
        description = ?,
        type        = ?,
        discount    = ?,
        min_qty     = ?,
        category    = ?,
        start_date  = ?,
        end_date    = ?,
        image_url   = ?
       WHERE id = ?`,
      [
        code,
        description,
        type,
        discount,
        min_qty || null,
        category || null,
        startDate || null,
        endDate || null,
        image || null,
        req.params.id,
      ]
    );

    if (result.affectedRows === 0) {
      return res.status(404).json({ message: 'Coupon not found' });
    }

    res.json({ message: 'Coupon updated' });
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
