const express  = require('express');
const router   = express.Router();
const pool     = require('../db');
const auth     = require('../middleware/auth');  // JWT middleware

/* ───── helpers ───── */
const required = (obj, keys) =>
  keys.filter((k) => !obj?.[k] || obj[k].toString().trim() === '');

/* ───────── GET /api/addresses ───────── */
router.get('/', auth, async (req, res) => {
  try {
    const [rows] = await pool.query(
      'SELECT * FROM addresses WHERE user_id = ? ORDER BY id DESC',
      [req.user.id]
    );
    res.json(rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server error' });
  }
});

/* ───────── GET /api/addresses/:id ───────── */
router.get('/:id', auth, async (req, res) => {
  try {
    const [rows] = await pool.query(
      'SELECT * FROM addresses WHERE id = ? AND user_id = ?',
      [req.params.id, req.user.id]
    );
    if (!rows.length)
      return res.status(404).json({ message: 'Address not found' });
    res.json(rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server error' });
  }
});

/* ───────── POST /api/addresses ───────── */
router.post('/', auth, async (req, res) => {
  const body = req.body;
  const miss = required(body, ['label', 'pincode', 'city', 'state', 'line1']);
  if (miss.length)
    return res.status(422).json({ message: `Missing ${miss.join(', ')}` });

  try {
    const [result] = await pool.query(
      `INSERT INTO addresses SET ?`,
      { ...body, user_id: req.user.id }
    );
    /* return full row */
    const [rows] = await pool.query(
      'SELECT * FROM addresses WHERE id = ?',
      [result.insertId]
    );
    res.json(rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server error' });
  }
});

/* ───────── PATCH /api/addresses/:id ───────── */
router.patch('/:id', auth, async (req, res) => {
  const fields = Object.fromEntries(
    Object.entries(req.body).filter(([, v]) => v !== undefined && v !== null)
  );
  if (!Object.keys(fields).length)
    return res.status(422).json({ message: 'No fields to update' });

  try {
    const [result] = await pool.query(
      `UPDATE addresses SET ? WHERE id = ? AND user_id = ?`,
      [fields, req.params.id, req.user.id]
    );
    if (!result.affectedRows)
      return res.status(404).json({ message: 'Address not found' });

    const [rows] = await pool.query(
      'SELECT * FROM addresses WHERE id = ?',
      [req.params.id]
    );
    res.json(rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server error' });
  }
});

/* ───────── DELETE /api/addresses/:id ───────── */
router.delete('/:id', auth, async (req, res) => {
  try {
    const [result] = await pool.query(
      `DELETE FROM addresses WHERE id = ? AND user_id = ?`,
      [req.params.id, req.user.id]
    );
    if (!result.affectedRows)
      return res.status(404).json({ message: 'Address not found' });
    res.json({ success: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Server error' });
  }
});

module.exports = router;
