const express = require('express');
const pool = require('../db');
const auth = require('../middleware/auth');
const admin = require('../middleware/admin');

const router = express.Router();

/* ─── LIST customers (admin) ─── */
router.get('/admin/customers', auth, admin, async (_, res, next) => {
  try {
    const [rows] = await pool.query(
      'SELECT id, full_name, email, phone, blocked, created_at FROM users WHERE role="customer"'
    );
    res.json(rows);
  } catch (err) {
    next(err);
  }
});

/* ─── Block / unblock customer ─── */
router.patch(
  '/admin/customers/:id/block',
  auth,
  admin,
  async (req, res, next) => {
    try {
      const id = Number(req.params.id);
      if (id === req.user.id)
        return res.status(400).json({ message: "Can't block yourself" });

      const { blocked } = req.body; // true/false
      await pool.query('UPDATE users SET blocked=? WHERE id=?', [blocked, id]);
      res.json({ message: blocked ? 'Blocked' : 'Unblocked' });
    } catch (err) {
      next(err);
    }
  }
);

module.exports = router;
