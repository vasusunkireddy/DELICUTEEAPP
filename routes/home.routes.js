/** routes/home.routes.js */
const express = require('express');
const pool = require('../db');
const authenticateToken = require('../middleware/auth');

const router = express.Router();

/*  GET /api/home
    -> { user: { id, fullName }, banners: [...] } */
router.get('/', authenticateToken, async (req, res) => {
  try {
    /* user */
    const [userRows] = await pool.query(
      'SELECT id, full_name AS fullName FROM users WHERE id = ?',
      [req.user.id]
    );
    if (!userRows.length) {
      return res.status(404).json({ message: 'User not found' });
    }

    /* banners (active + already started) */
    const [banners] = await pool.query(
      `SELECT id,
              title,
              \`desc\`   AS description,
              image,                 -- keep column name as "image"
              startDate,
              endDate
         FROM banners
        WHERE active = 1
          AND NOW() >= startDate     -- banner has started
          AND NOW() <= endDate       -- banner not yet expired
        ORDER BY startDate DESC`
    );

    res.json({ user: userRows[0], banners });
  } catch (err) {
    console.error('GET /home:', err);
    res.status(500).json({ message: 'Server error' });
  }
});

module.exports = router;
