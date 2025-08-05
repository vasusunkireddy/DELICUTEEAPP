// routes/payments.routes.js
const express = require('express');
const pool = require('../db');

const router = express.Router();

// Payment method options
const PAYMENT_METHODS = {
  upi: ['Paytm', 'PhonePe', 'GPay'],
  wallets: ['Mobikwik Wallet'],
  payLater: ['Simpl'],
  cod: ['COD'],
};

// GET /api/payments/methods
router.get('/methods', (_req, res) => {
  console.log('Handling GET /api/payments/methods');
  res.json(PAYMENT_METHODS);
});

// POST /api/payments/verify
router.post('/verify', async (req, res) => {
  const { orderId, userId, method } = req.body;
  console.log('➡️ /api/payments/verify request:', { orderId, userId, method });

  if (!orderId || !userId || !method) {
    console.warn('❌ Missing fields');
    return res.status(400).json({ error: 'Missing orderId, userId or method' });
  }

  const newStatus = method === 'COD' ? 'Confirmed' : 'Pending';

  try {
    console.log(`🔎 Checking orderId=${orderId}, userId=${userId}`);
    const [check] = await pool.query(
      `SELECT * FROM orders WHERE id = ? AND user_id = ?`, // Changed table to 'orders'
      [orderId, userId]
    );

    if (check.length === 0) {
      console.warn('❌ Order not found for user');
      return res.status(404).json({ error: 'Order not found or mismatch' });
    }

    const [result] = await pool.query(
      `UPDATE orders SET status = ? WHERE id = ? AND user_id = ?`, // Changed table to 'orders'
      [newStatus, orderId, userId]
    );

    console.log('✅ Status updated:', { orderId, newStatus });
    res.json({ success: true, status: newStatus });
  } catch (err) {
    console.error('🔥 VERIFY ERROR:', err);
    res.status(500).json({ error: 'Payment verification failed' });
  }
});

module.exports = router;