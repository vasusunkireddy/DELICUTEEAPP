const express = require('express');
const pool = require('../db');
const QRCode = require('qrcode'); // npm install qrcode
const { sendOrderStatusEmail } = require('../../utils/mailer');
const jwt = require('jsonwebtoken'); // npm install jsonwebtoken

const router = express.Router();

// Authentication middleware (for protected routes)
const authMiddleware = (req, res, next) => {
  const token = req.headers.authorization?.split(' ')[1];
  if (!token) {
    console.log(`Unauthorized request to ${req.path}: No token provided`);
    return res.status(401).json({ message: 'Unauthorized: No token provided' });
  }
  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET || 'your_jwt_secret');
    req.user = decoded;
    next();
  } catch (err) {
    console.error(`Invalid token for ${req.path}:`, err.message);
    return res.status(401).json({ message: 'Unauthorized: Invalid token' });
  }
};

// Verify database connection and log database details
pool.getConnection()
  .then(async (conn) => {
    console.log('Database connection successful');
    const [rows] = await conn.query('SELECT DATABASE() as db_name');
    console.log(`Connected to database: ${rows[0].db_name}`);
    const [tables] = await conn.query('SHOW TABLES');
    console.log('Tables in database:', tables.map(row => Object.values(row)[0]));
    const [orders] = await conn.query('SELECT id, total FROM orders WHERE id IN (36, 48, 49, 50)');
    console.log('Test query result at startup:', orders);
    conn.release();
  })
  .catch(err => console.error('Database connection error:', err.message, err.stack));

// Test endpoint to verify database contents
router.get('/test-orders', async (req, res) => {
  try {
    const [db] = await pool.query('SELECT DATABASE() as db_name');
    const [rows] = await pool.query('SELECT id, total FROM orders WHERE id IN (36, 48, 49, 50)');
    console.log(`Test orders endpoint result (database: ${db[0].db_name}):`, rows);
    res.json({ database: db[0].db_name, orders: rows });
  } catch (err) {
    console.error('Test orders error:', err.message, err.stack);
    res.status(500).json({ message: 'Failed to fetch test orders', error: err.message });
  }
});

/* ═══════════════════════════════════════════════════════════
   GET /api/orders/admin – Admin order list (requires auth)
   ═══════════════════════════════════════════════════════════ */
router.get('/admin', authMiddleware, async (_req, res) => {
  try {
    const [orders] = await pool.query(`
      SELECT
        o.id,
        o.user_id,
        o.address,
        o.total,
        o.status,
        o.payment_method AS paymentMethod,
        o.payment_status AS paymentStatus,
        o.payment_id,
        o.customer_name AS customerName,
        o.phone,
        o.email,
        o.address AS addressDetails,
        o.created_at
      FROM orders o
      ORDER BY o.created_at DESC
    `);

    const withItems = await Promise.all(
      orders.map(async (order) => {
        const [items] = await pool.query(
          `SELECT name, price, qty FROM order_items WHERE order_id = ? ORDER BY name`,
          [order.id]
        );
        return { ...order, items };
      })
    );

    console.log(`Fetched ${withItems.length} orders:`, withItems.map(o => ({ id: o.id, total: o.total })));
    res.json(withItems);
  } catch (err) {
    console.error('Admin orders fetch error →', err.message, err.stack);
    res.status(500).json({ message: 'Failed to load orders', error: err.message });
  }
});

/* ═══════════════════════════════════════════════════════════
   PATCH /api/orders/admin/:id/status – update status (requires auth)
   ═══════════════════════════════════════════════════════════ */
router.patch('/admin/:id/status', authMiddleware, async (req, res) => {
  const { id } = req.params;
  const { status, reason } = req.body;

  if (!status) return res.status(400).json({ message: 'Status is required' });
  if (status === 'Cancelled' && !reason)
    return res.status(400).json({ message: 'Reason required for cancellation' });

  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();

    await conn.query(
      `UPDATE orders
         SET status = ?,
             cancel_reason = CASE WHEN ? = 'Cancelled' THEN ? ELSE NULL END,
             delivered_at = CASE WHEN ? = 'Delivered' THEN NOW() ELSE delivered_at END,
             payment_status = CASE WHEN ? = 'Delivered' THEN 'PAID' ELSE payment_status END
       WHERE id = ?`,
      [status, status, reason || null, status, status, id]
    );

    const [[order]] = await conn.query(
      `SELECT o.id, o.total, o.status, o.cancel_reason,
              o.payment_method AS paymentMethod,
              o.payment_status AS paymentStatus,
              o.payment_id,
              o.customer_name AS customerName,
              o.phone,
              o.email,
              o.address AS addressDetails
         FROM orders o
         WHERE o.id = ?`,
      [id]
    );

    const [items] = await conn.query(
      `SELECT name, price, qty FROM order_items WHERE order_id = ? ORDER BY name`,
      [id]
    );
    order.items = items;

    await conn.commit();

    if (order.email) {
      sendOrderStatusEmail({
        to: order.email,
        name: order.customerName,
        orderId: order.id,
        status: order.status,
        reason: reason || '',
      })
        .then(() => console.log(`📧 status mail sent → ${order.email}`))
        .catch((e) => console.warn('email failed:', e.message));
    }

    res.json(order);
  } catch (err) {
    await conn.rollback();
    console.error('Admin status update error →', err.message, err.stack);
    res.status(500).json({ message: 'Failed to update status', error: err.message });
  } finally {
    conn.release();
  }
});

/* ═══════════════════════════════════════════════════════════
   DELETE /api/orders/admin/:id – delete order + items (requires auth)
   ═══════════════════════════════════════════════════════════ */
router.delete('/admin/:id', authMiddleware, async (req, res) => {
  const { id } = req.params;
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    await conn.query('DELETE FROM order_items WHERE order_id = ?', [id]);
    await conn.query('DELETE FROM orders WHERE id = ?', [id]);
    await conn.commit();
    res.json({ success: true });
  } catch (err) {
    await conn.rollback();
    console.error('Admin order delete error →', err.message, err.stack);
    res.status(500).json({ message: 'Failed to delete order', error: err.message });
  } finally {
    conn.release();
  }
});

/* ═══════════════════════════════════════════════════════════
   GET /api/orders/generate-qr/:orderId – Generate dynamic UPI QR (public)
   ═══════════════════════════════════════════════════════════ */
router.get('/generate-qr/:orderId', async (req, res) => {
  const { orderId } = req.params;
  console.log(`Received QR code request for orderId=${orderId}`);
  try {
    // Validate orderId
    const orderIdNum = Number(orderId);
    if (!Number.isInteger(orderIdNum)) {
      console.log(`Invalid orderId: ${orderId}`);
      return res.status(400).json({ message: 'Invalid order ID' });
    }

    // Fetch order details
    const [db] = await pool.query('SELECT DATABASE() as db_name');
    console.log(`Querying orders table for id=${orderIdNum} in database: ${db[0].db_name}`);
    const [rows] = await pool.query(
      `SELECT id, total FROM orders WHERE id = ?`,
      [orderIdNum]
    );
    console.log(`Query result for orderId=${orderIdNum}:`, rows);

    if (!rows.length) {
      console.log(`Order not found: orderId=${orderIdNum}`);
      return res.status(404).json({ message: `Order #${orderIdNum} not found` });
    }

    const order = rows[0];

    // UPI Payment details
    const upiId = '9652296548@ybl';
    const payeeName = encodeURIComponent('Delicute');
    const amount = Number(order.total).toFixed(2);
    const txnNote = encodeURIComponent(`Order #${order.id}`);
    const currency = 'INR';

    // Construct UPI payment URL
    const upiUrl = `upi://pay?pa=${upiId}&pn=${payeeName}&tn=${txnNote}&am=${amount}&cu=${currency}`;
    console.log(`Generated UPI URL: ${upiUrl}`);

    // Generate QR as Data URL
    const qrDataUrl = await QRCode.toDataURL(upiUrl, {
      errorCorrectionLevel: 'H',
      type: 'image/png',
      margin: 2,
      scale: 8,
    });

    // Convert Data URL to image response
    const img = Buffer.from(qrDataUrl.split(',')[1], 'base64');
    res.writeHead(200, {
      'Content-Type': 'image/png',
      'Content-Length': img.length,
    });
    res.end(img);
  } catch (err) {
    console.error('QR generation error →', err.message, err.stack);
    res.status(500).json({ message: 'Failed to generate QR code', error: err.message });
  }
});

module.exports = router;