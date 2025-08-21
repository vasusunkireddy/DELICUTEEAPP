const express = require('express');
const nodemailer = require('nodemailer');
const dayjs = require('dayjs');

const router = express.Router();

// Payment method options
const PAYMENT_METHODS = {
  upi: [
    { name: 'Paytm', vpa: '9652296548@pthdfc' },
    { name: 'PhonePe', vpa: 'Q952457548@ybl' },
    { name: 'GPay', vpa: 'svasudevareddy18604@oksbi' },
  ],
};

// Valid payment methods
const VALID_METHODS = ['UPI', 'COD'];

// Configure Nodemailer
const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS,
  },
});

// Simulated UPI verification
const verifyUPIPayment = async (orderId, gatewayTxnId) => {
  if (gatewayTxnId && gatewayTxnId.endsWith('success')) {
    return { status: 'SUCCESS', transactionId: gatewayTxnId };
  } else if (gatewayTxnId && gatewayTxnId.endsWith('failed')) {
    return { status: 'FAILED', transactionId: gatewayTxnId };
  }
  return { status: 'PENDING' };
};

// GET /api/payments/methods
router.get('/methods', (_req, res) => {
  console.log('📡 GET /api/payments/methods');
  res.json(PAYMENT_METHODS);
});

// GET /api/payments/status/:orderId
router.get('/status/:orderId', async (req, res) => {
  const { orderId } = req.params;
  console.log('📡 GET /api/payments/status/:orderId', { orderId });

  try {
    const [payments] = await req.pool.query(
      `SELECT status, gatewayTxnId
       FROM payments
       WHERE orderId = ?`,
      [orderId]
    );

    if (payments.length === 0) {
      return res.status(404).json({ error: 'Payment not found for this order' });
    }

    const payment = payments[0];

    if (payment.status !== 'PENDING') {
      return res.json({ status: payment.status });
    }

    const verification = await verifyUPIPayment(orderId, payment.gatewayTxnId);

    if (verification.status !== payment.status) {
      await req.pool.query(
        `UPDATE payments SET status = ?, gatewayTxnId = ? WHERE orderId = ?`,
        [verification.status, verification.transactionId || payment.gatewayTxnId, orderId]
      );
      await req.pool.query(
        `UPDATE orders SET payment_status = ? WHERE id = ?`,
        [verification.status, orderId]
      );

      if (verification.status === 'SUCCESS') {
        const [order] = await req.pool.query(
          `SELECT customer_name AS name, email
           FROM orders
           WHERE id = ?`,
          [orderId]
        );

        if (order.length > 0 && order[0].email) {
          const customerEmail = order[0].email;
          const customerName = order[0].name || 'Customer';

          const mailOptions = {
            from: `"Delicute" <${process.env.EMAIL_USER}>`,
            to: customerEmail,
            subject: 'Delicute Payment Receipt',
            html: `
              <h2>Hi ${customerName},</h2>
              <p>Thank you for your order with <strong>Delicute</strong> 🎉</p>
              <p>Your payment has been confirmed successfully.</p>
              <p><strong>Order ID:</strong> ${orderId}</p>
              <p><strong>Payment Method:</strong> UPI</p>
              <p><strong>Status:</strong> ${verification.status}</p>
              <br/>
              <p>We’re preparing your order and will notify you once it’s ready!</p>
              <p style="color:gray;font-size:12px;">Powered by Delicute</p>
            `,
          };

          await transporter.sendMail(mailOptions);
          console.log('📧 Email sent to customer:', customerEmail);
        }
      }
    }

    console.log(`✅ Payment status for order ${orderId}: ${verification.status}`);
    res.json({ status: verification.status });
  } catch (err) {
    console.error('🔥 GET PAYMENT STATUS ERROR:', err);
    res.status(500).json({ error: 'Failed to fetch payment status' });
  }
});

// POST /api/payments/create
router.post('/create', async (req, res) => {
  const { orderId, customerId, method, amount, gatewayTxnId, notes } = req.body;
  console.log('📡 POST /api/payments/create', { orderId, customerId, method, amount, gatewayTxnId, notes });

  if (!orderId || !customerId || !method || !amount || amount <= 0) {
    return res.status(400).json({
      error: 'Missing or invalid fields (orderId, customerId, method, amount)',
    });
  }

  if (!VALID_METHODS.includes(method)) {
    return res.status(400).json({ error: `Invalid payment method. Must be: ${VALID_METHODS.join(', ')}` });
  }

  try {
    const [result] = await req.pool.query(
      `INSERT INTO payments (orderId, customerId, method, amount, status, gatewayTxnId, notes, paidAt)
       VALUES (?, ?, ?, ?, ?, ?, ?, NOW())`,
      [
        orderId,
        customerId,
        method,
        method === 'COD' ? 'SUCCESS' : 'PENDING',
        amount,
        gatewayTxnId || null,
        notes || null,
      ]
    );

    await req.pool.query(
      `UPDATE orders SET payment_status = ?, payment_method = ?, payment_id = ? WHERE id = ? AND user_id = ?`,
      [method === 'COD' ? 'SUCCESS' : 'PENDING', method, result.insertId, orderId, customerId]
    );

    console.log('✅ Payment record created:', result.insertId);
    res.json({
      success: true,
      paymentId: result.insertId,
      status: method === 'COD' ? 'SUCCESS' : 'PENDING',
      orderId,
    });
  } catch (err) {
    console.error('🔥 CREATE PAYMENT ERROR:', err);
    res.status(500).json({ error: 'Failed to create payment' });
  }
});

// POST /api/payments/verify
router.post('/verify', async (req, res) => {
  const { orderId, customerId, method, success, gatewayTxnId } = req.body;
  console.log('📡 POST /api/payments/verify', { orderId, customerId, method, success, gatewayTxnId });

  if (!orderId || !customerId || !method) {
    return res.status(400).json({ error: 'Missing orderId, customerId, or method' });
  }

  if (!VALID_METHODS.includes(method)) {
    return res.status(400).json({ error: `Invalid payment method. Must be: ${VALID_METHODS.join(', ')}` });
  }

  const newStatus = success === true ? 'SUCCESS' : 'FAILED';

  try {
    const [paymentUpdate] = await req.pool.query(
      `UPDATE payments SET status = ?, gatewayTxnId = ? WHERE orderId = ? AND customerId = ?`,
      [newStatus, gatewayTxnId || null, orderId, customerId]
    );

    if (paymentUpdate.affectedRows === 0) {
      return res.status(404).json({ error: 'Payment not found or customer mismatch' });
    }

    const [orderUpdate] = await req.pool.query(
      `UPDATE orders SET payment_status = ?, payment_method = ? WHERE id = ? AND user_id = ?`,
      [newStatus, method, orderId, customerId]
    );

    if (orderUpdate.affectedRows === 0) {
      return res.status(404).json({ error: 'Order not found or customer mismatch' });
    }

    if (newStatus === 'SUCCESS') {
      const [order] = await req.pool.query(
        `SELECT customer_name AS name, email
         FROM orders
         WHERE id = ? AND user_id = ?`,
        [orderId, customerId]
      );

      if (order.length > 0 && order[0].email) {
        const customerEmail = order[0].email;
        const customerName = order[0].name || 'Customer';

        const mailOptions = {
          from: `"Delicute" <${process.env.EMAIL_USER}>`,
          to: customerEmail,
          subject: 'Delicute Payment Receipt',
          html: `
            <h2>Hi ${customerName},</h2>
            <p>Thank you for your order with <strong>Delicute</strong> 🎉</p>
            <p>Your payment has been confirmed successfully.</p>
            <p><strong>Order ID:</strong> ${orderId}</p>
            <p><strong>Payment Method:</strong> ${method}</p>
            <p><strong>Status:</strong> ${newStatus}</p>
            <br/>
            <p>We’re preparing your order and will notify you once it’s ready!</p>
            <p style="color:gray;font-size:12px;">Powered by Delicute</p>
          `,
        };

        await transporter.sendMail(mailOptions);
        console.log('📧 Email sent to customer:', customerEmail);
      }
    }

    console.log('✅ Payment verified:', { orderId, newStatus });
    res.json({ success: true, status: newStatus });
  } catch (err) {
    console.error('🔥 VERIFY ERROR:', err);
    res.status(500).json({ error: 'Payment verification failed' });
  }
});

// POST /api/payments/cancel
router.post('/cancel', async (req, res) => {
  const { orderId, customerId } = req.body;
  console.log('📡 POST /api/payments/cancel', { orderId, customerId });

  if (!orderId || !customerId) {
    return res.status(400).json({ error: 'Missing orderId or customerId' });
  }

  try {
    const [paymentUpdate] = await req.pool.query(
      `UPDATE payments SET status = 'CANCELLED' WHERE orderId = ? AND customerId = ? AND status = 'PENDING'`,
      [orderId, customerId]
    );

    if (paymentUpdate.affectedRows === 0) {
      return res.status(404).json({ error: 'Payment not found, not pending, or customer mismatch' });
    }

    await req.pool.query(
      `UPDATE orders SET payment_status = 'CANCELLED' WHERE id = ? AND user_id = ?`,
      [orderId, customerId]
    );

    console.log('✅ Payment cancelled:', { orderId });
    res.json({ success: true, status: 'CANCELLED' });
  } catch (err) {
    console.error('🔥 CANCEL PAYMENT ERROR:', err);
    res.status(500).json({ error: 'Failed to cancel payment' });
  }
});

module.exports = router;