const express = require('express');
const router = express.Router();
const pool = require('../db');

// GET contact info for customers
router.get('/', async (req, res) => {
  try {
    const [rows] = await pool.query(`
      SELECT app_name, support_email, support_phone 
      FROM settings 
      LIMIT 1
    `);

    if (rows.length === 0) {
      return res.status(404).json({ message: 'No contact settings found' });
    }

    res.json(rows[0]);
  } catch (err) {
    console.error('❌ ContactUs route error:', err.message);
    res.status(500).json({ message: 'Internal server error' });
  }
});

module.exports = router;
