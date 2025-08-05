const express = require('express');
const router = express.Router();
const pool = require('../db');

/* GET /api/feedback (optional ?rating=4 filter) */
router.get('/', async (req, res) => {
  try {
    const { rating } = req.query;
    const query = `
      SELECT r.id, r.orderId, r.customerId, r.itemId, r.rating, r.comment, r.createdAt, u.full_name AS customerName
      FROM reviews r
      LEFT JOIN users u ON u.id = r.customerId
      ${rating ? 'WHERE r.rating = ?' : ''}
      ORDER BY r.createdAt DESC
    `;
    const [rows] = await pool.query(query, rating ? [Number(rating)] : []);
    res.json(rows);
  } catch (error) {
    console.error('Feedback fetch error:', error.message);
    res.status(500).json({ message: 'Failed to fetch feedback', error: error.message });
  }
});

module.exports = router;