// routes/user.routes.js
const express = require('express');
const router = express.Router();
const pool = require('../db');
const authenticate = require('../middleware/authenticate');

router.delete('/me', authenticate, async (req, res) => {
  try {
    console.log('Authenticated user:', req.user); // DEBUG

    const userId = req.user?.id;
    if (!userId) {
      return res.status(400).json({ message: 'User ID missing in token' });
    }

    const [result] = await pool.query('DELETE FROM users WHERE id = ?', [userId]);

    if (result.affectedRows === 0) {
      return res.status(404).json({ message: 'User not found or already deleted' });
    }

    res.json({ message: 'Account deleted successfully' });
  } catch (err) {
    console.error('❌ Delete error:', err); // LOG FULL ERROR
    res.status(500).json({ message: 'Server error during account deletion' });
  }
});

module.exports = router;
