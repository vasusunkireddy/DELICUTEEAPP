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

const USE_DATETIME = false;
function formatDate(date) {
  return USE_DATETIME ? formatDateTimeToMySQL(date) : formatDateToMySQL(date);
}

/* ─── Error Handler Middleware ─── */
router.use((err, _req, res, _next) => {
  console.error('API error:', err);
  res.status(500).json({ message: 'Internal server error', error: err.message });
});

/* ─── ADMIN: Get all categories ─── */
router.get('/categories', auth, admin, async (_req, res, next) => {
  try {
    const [rows] = await pool.query('SELECT id, name, description, image FROM categories ORDER BY name');
    console.log('Categories response:', rows);
    if (!rows.length) {
      console.log('No categories found');
      return res.json([]); // Return empty array if no categories
    }
    res.json(rows);
  } catch (err) {
    console.error('Categories error:', err);
    next(err);
  }
});

/* ─── ADMIN: Get all menu items ─── */
router.get('/menu', auth, admin, async (_req, res, next) => {
  try {
    const [rows] = await pool.query('SELECT id, name FROM menu_items ORDER BY name');
    console.log('Menu items response:', rows);
    res.json(rows);
  } catch (err) {
    console.error('Menu items error:', err);
    next(err);
  }
});

/* ─── ADMIN: Get all coupons ─── */
router.get('/', auth, admin, async (_req, res, next) => {
  try {
    const [rows] = await pool.query(`
      SELECT id, code, description, type, discount, min_qty, buy_qty, free_qty, 
             category_id, menu_item_id, image_url AS image, start_date, end_date
      FROM coupons 
      ORDER BY id DESC
    `);
    console.log('Coupons response:', rows);
    res.json(rows);
  } catch (err) {
    console.error('Coupons error:', err);
    next(err);
  }
});

/* ─── ADMIN: Create new coupon ─── */
router.post('/', auth, admin, async (req, res, next) => {
  try {
    const {
      code, description, type, discount, min_qty, buy_qty, free_qty,
      category_id, menu_item_id, image, start_date, end_date
    } = req.body;

    if (!code) return res.status(400).json({ message: 'Coupon code is required' });
    if (!['FIRST_ORDER', 'PERCENT', 'BUY_X', 'BUY_X_GET_Y'].includes(type)) {
      return res.status(400).json({ message: 'Invalid coupon type' });
    }

    if (['FIRST_ORDER', 'PERCENT', 'BUY_X'].includes(type)) {
      if (discount === undefined || discount === null || isNaN(discount) || discount < 0) {
        return res.status(400).json({ message: 'Valid discount percentage required' });
      }
    }
    if (type === 'BUY_X') {
      if (!category_id) return res.status(400).json({ message: 'Category ID is required for BUY_X coupon' });
      if (min_qty === undefined || min_qty === null || isNaN(min_qty) || min_qty <= 0) {
        return res.status(400).json({ message: 'Valid minimum quantity required for BUY_X coupon' });
      }
      const [category] = await pool.query('SELECT id FROM categories WHERE id = ?', [category_id]);
      if (category.length === 0) return res.status(400).json({ message: 'Invalid category ID' });
    }
    if (type === 'BUY_X_GET_Y') {
      if (!menu_item_id) return res.status(400).json({ message: 'Menu item ID is required for BUY_X_GET_Y coupon' });
      if (buy_qty === undefined || buy_qty === null || isNaN(buy_qty) || buy_qty <= 0) {
        return res.status(400).json({ message: 'Valid buy quantity required for BUY_X_GET_Y coupon' });
      }
      if (free_qty === undefined || free_qty === null || isNaN(free_qty) || free_qty <= 0) {
        return res.status(400).json({ message: 'Valid free quantity required for BUY_X_GET_Y coupon' });
      }
      const [menuItem] = await pool.query('SELECT id FROM menu_items WHERE id = ?', [menu_item_id]);
      if (menuItem.length === 0) return res.status(400).json({ message: 'Invalid menu item ID' });
    }
    if (start_date && end_date && new Date(start_date) > new Date(end_date)) {
      return res.status(400).json({ message: 'End date must be after start date' });
    }

    const [existing] = await pool.query('SELECT id FROM coupons WHERE code = ?', [code]);
    if (existing.length > 0) return res.status(400).json({ message: 'Coupon code already exists' });

    const [result] = await pool.query(
      `INSERT INTO coupons (
        code, description, type, discount, min_qty, buy_qty, free_qty, 
        category_id, menu_item_id, image_url, start_date, end_date
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        code,
        description || null,
        type,
        discount !== null && discount !== undefined ? Number(discount) : null,
        min_qty !== null && min_qty !== undefined ? Number(min_qty) : null,
        buy_qty !== null && buy_qty !== undefined ? Number(buy_qty) : null,
        free_qty !== null && free_qty !== undefined ? Number(free_qty) : null,
        category_id || null,
        menu_item_id || null,
        image || null,
        formatDate(start_date),
        formatDate(end_date)
      ]
    );

    const [newCoupon] = await pool.query(
      `SELECT id, code, description, type, discount, min_qty, buy_qty, free_qty, 
              category_id, menu_item_id, image_url AS image, start_date, end_date
       FROM coupons WHERE id = ?`,
      [result.insertId]
    );
    console.log('Created coupon:', newCoupon[0]);
    res.status(201).json(newCoupon[0]);
  } catch (err) {
    console.error('Create coupon error:', err);
    next(err);
  }
});

/* ─── ADMIN: Update existing coupon ─── */
router.put('/:id', auth, admin, async (req, res, next) => {
  try {
    const {
      code, description, type, discount, min_qty, buy_qty, free_qty,
      category_id, menu_item_id, image, start_date, end_date
    } = req.body;

    if (!code) return res.status(400).json({ message: 'Coupon code is required' });
    if (!['FIRST_ORDER', 'PERCENT', 'BUY_X', 'BUY_X_GET_Y'].includes(type)) {
      return res.status(400).json({ message: 'Invalid coupon type' });
    }

    if (['FIRST_ORDER', 'PERCENT', 'BUY_X'].includes(type)) {
      if (discount === undefined || discount === null || isNaN(discount) || discount < 0) {
        return res.status(400).json({ message: 'Valid discount percentage required' });
      }
    }
    if (type === 'BUY_X') {
      if (!category_id) return res.status(400).json({ message: 'Category ID is required for BUY_X coupon' });
      if (min_qty === undefined || min_qty === null || isNaN(min_qty) || min_qty <= 0) {
        return res.status(400).json({ message: 'Valid minimum quantity required for BUY_X coupon' });
      }
      const [category] = await pool.query('SELECT id FROM categories WHERE id = ?', [category_id]);
      if (category.length === 0) return res.status(400).json({ message: 'Invalid category ID' });
    }
    if (type === 'BUY_X_GET_Y') {
      if (!menu_item_id) return res.status(400).json({ message: 'Menu item ID is required for BUY_X_GET_Y coupon' });
      if (buy_qty === undefined || buy_qty === null || isNaN(buy_qty) || buy_qty <= 0) {
        return res.status(400).json({ message: 'Valid buy quantity required for BUY_X_GET_Y coupon' });
      }
      if (free_qty === undefined || free_qty === null || isNaN(free_qty) || free_qty <= 0) {
        return res.status(400).json({ message: 'Valid free quantity required for BUY_X_GET_Y coupon' });
      }
      const [menuItem] = await pool.query('SELECT id FROM menu_items WHERE id = ?', [menu_item_id]);
      if (menuItem.length === 0) return res.status(400).json({ message: 'Invalid menu item ID' });
    }
    if (start_date && end_date && new Date(start_date) > new Date(end_date)) {
      return res.status(400).json({ message: 'End date must be after start date' });
    }

    const [existing] = await pool.query('SELECT id FROM coupons WHERE code = ? AND id != ?', [code, req.params.id]);
    if (existing.length > 0) return res.status(400).json({ message: 'Coupon code already exists' });

    const [result] = await pool.query(
      `UPDATE coupons SET
        code = ?, description = ?, type = ?, discount = ?, min_qty = ?, buy_qty = ?, free_qty = ?, 
        category_id = ?, menu_item_id = ?, image_url = ?, start_date = ?, end_date = ?
       WHERE id = ?`,
      [
        code,
        description || null,
        type,
        discount !== null && discount !== undefined ? Number(discount) : null,
        min_qty !== null && min_qty !== undefined ? Number(min_qty) : null,
        buy_qty !== null && buy_qty !== undefined ? Number(buy_qty) : null,
        free_qty !== null && free_qty !== undefined ? Number(free_qty) : null,
        category_id || null,
        menu_item_id || null,
        image || null,
        formatDate(start_date),
        formatDate(end_date),
        req.params.id
      ]
    );

    if (result.affectedRows === 0) return res.status(404).json({ message: 'Coupon not found' });

    const [updatedCoupon] = await pool.query(
      `SELECT id, code, description, type, discount, min_qty, buy_qty, free_qty, 
              category_id, menu_item_id, image_url AS image, start_date, end_date
       FROM coupons WHERE id = ?`,
      [req.params.id]
    );
    console.log('Updated coupon:', updatedCoupon[0]);
    res.json(updatedCoupon[0]);
  } catch (err) {
    console.error('Update coupon error:', err);
    next(err);
  }
});

/* ─── ADMIN: Delete coupon ─── */
router.delete('/:id', auth, admin, async (req, res, next) => {
  try {
    const [result] = await pool.query('DELETE FROM coupons WHERE id = ?', [req.params.id]);

    if (result.affectedRows === 0) return res.status(404).json({ message: 'Coupon not found' });

    console.log('Deleted coupon ID:', req.params.id);
    res.json({ message: 'Coupon deleted' });
  } catch (err) {
    console.error('Delete coupon error:', err);
    next(err);
  }
});

module.exports = router;