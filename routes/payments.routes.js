const express = require('express');
const nodemailer = require('nodemailer');
const dayjs = require('dayjs');
const mysql = require('mysql2/promise'); // Assuming MySQL is used

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
  // Simulate UPI payment status (replace with real payment gateway in production)
  if (gatewayTxnId && gatewayTxnId.endsWith('success')) {
    return { status: 'SUCCESS', transactionId: gatewayTxnId };
  } else if (gatewayTxnId && gatewayTxnId.endsWith('failed')) {
    return { status: 'FAILED', transactionId: gatewayTxnId };
  }
  return { status: 'PENDING' };
};

// Middleware to ensure database connection
router.use(async (req, res, next) => {
  if (!req.pool) {
    return res.status(500).json({ error: 'Database connection not available' });
  }
  next();
});

// GET /api/payments/methods
router.get('/methods', async (_req, res) => {
  console.log('📡 GET /api/payments/methods');
  try {
    res.json(PAYMENT_METHODS);
  } catch (err) {
    console.error('🔥 GET METHODS ERROR:', err);
    res.status(500).json({ error: 'Failed to fetch payment methods' });
  }
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
        `UPDATE customer_orders SET payment_status = ? WHERE orderId = ?`,
        [verification.status, orderId]
      );

      if (verification.status === 'SUCCESS') {
        const [order] = await req.pool.query(
          `SELECT customer_name AS name, email
           FROM customer_orders
           WHERE orderId = ?`,
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
        amount,
        method === 'COD' ? 'SUCCESS' : 'PENDING',
        gatewayTxnId || null,
        notes || null,
      ]
    );

    await req.pool.query(
      `UPDATE customer_orders SET payment_status = ?, payment_method = ?, payment_id = ? WHERE orderId = ? AND userId = ?`,
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
      `UPDATE customer_orders SET payment_status = 'CANCELLED', status = 'Cancelled' WHERE orderId = ? AND userId = ?`,
      [orderId, customerId]
    );

    console.log('✅ Payment cancelled:', { orderId });
    res.json({ success: true, status: 'CANCELLED' });
  } catch (err) {
    console.error('🔥 CANCEL PAYMENT ERROR:', err);
    res.status(500).json({ error: 'Failed to cancel payment' });
  }
});

// POST /api/customer-orders
router.post('/customer-orders', async (req, res) => {
  const { userId, address, total, cartItems, payment, status, couponCode } = req.body;
  console.log('📡 POST /api/customer-orders', { userId, address, total, cartItems, payment, status, couponCode });

  if (!userId || !address || !total || !cartItems || !payment || !status) {
    return res.status(400).json({
      error: 'Missing required fields (userId, address, total, cartItems, payment, status)',
    });
  }

  try {
    const orderId = `order_${Date.now()}`;
    const [result] = await req.pool.query(
      `INSERT INTO customer_orders (orderId, userId, addressId, total, cartItems, payment_method, status, payment_status, couponCode, createdAt)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, NOW())`,
      [
        orderId,
        userId,
        address,
        total,
        JSON.stringify(cartItems),
        payment,
        status,
        status === 'Confirmed' ? 'SUCCESS' : 'PENDING',
        couponCode || null,
      ]
    );

    console.log('✅ Order created:', orderId);
    res.json({ success: true, orderId });
  } catch (err) {
    console.error('🔥 CREATE ORDER ERROR:', err);
    res.status(500).json({ error: 'Failed to create order' });
  }
});

// PATCH /api/customer-orders/:orderId
router.patch('/customer-orders/:orderId', async (req, res) => {
  const { orderId } = req.params;
  const { status } = req.body;
  console.log('📡 PATCH /api/customer-orders/:orderId', { orderId, status });

  if (!status) {
    return res.status(400).json({ error: 'Missing status field' });
  }

  try {
    const [result] = await req.pool.query(
      `UPDATE customer_orders SET status = ? WHERE orderId = ?`,
      [status, orderId]
    );

    if (result.affectedRows === 0) {
      return res.status(404).json({ error: 'Order not found' });
    }

    console.log('✅ Order updated:', orderId);
    res.json({ success: true, orderId });
  } catch (err) {
    console.error('🔥 UPDATE ORDER ERROR:', err);
    res.status(500).json({ error: 'Failed to update order' });
  }
});

// DELETE /api/cart
router.delete('/cart', async (req, res) => {
  console.log('📡 DELETE /api/cart');

  try {
    // Assuming cart is stored in a `cart` table; adjust based on your schema
    await req.pool.query(`DELETE FROM cart WHERE 1=1`); // Clears entire cart (modify to user-specific if needed)
    console.log('✅ Cart cleared');
    res.json({ success: true });
  } catch (err) {
    console.error('🔥 CLEAR CART ERROR:', err);
    res.status(500).json({ error: 'Failed to clear cart' });
  }
});

module.exports = router;