const express = require('express');
const router = express.Router();
const pool = require('../db');
const QRCode = require('qrcode');
const { sendOrderStatusEmail } = require('../utils/mailer');

/* ─── ADMIN: Get all orders ─── */
router.get('/admin', async (_req, res) => {
  try {
    const [orders] = await pool.query(`
      SELECT 
        o.id, o.user_id, o.address, o.total, o.status, o.payment_method AS paymentMethod,
        o.payment_status AS paymentStatus, o.payment_id, o.customer_name, o.phone, o.created_at
      FROM orders o
      ORDER BY o.created_at DESC
    `);

    const withItems = await Promise.all(
      orders.map(async order => {
        const [items] = await pool.query(
          'SELECT name, price, qty FROM order_items WHERE order_id = ? ORDER BY name',
          [order.id]
        );
        return { ...order, items };
      })
    );

    res.json(withItems);
  } catch (err) {
    console.error('Admin orders fetch error →', err.message);
    res.status(500).json({ message: 'Failed to load orders', error: err.message });
  }
});

/* ─── ADMIN: Update order status ─── */
router.patch('/admin/:id/status', async (req, res) => {
  const { id } = req.params;
  const { status, reason } = req.body;

  if (!status) return res.status(400).json({ message: 'Status is required' });
  if (status === 'Cancelled' && !reason) return res.status(400).json({ message: 'Reason required for cancellation' });

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
      `SELECT id, total, status, cancel_reason, payment_method AS paymentMethod,
              payment_status AS paymentStatus, payment_id, customer_name, phone, created_at
       FROM orders WHERE id = ?`,
      [id]
    );

    const [items] = await conn.query(
      'SELECT name, price, qty FROM order_items WHERE order_id = ? ORDER BY name',
      [id]
    );
    order.items = items;

    await conn.commit();

    // Send email notification
    if (order.email) {
      sendOrderStatusEmail({
        to: order.email,
        name: order.customer_name || 'Customer',
        orderId: order.id,
        status: order.status,
        reason: reason || '',
      }).catch(e => console.warn('Email failed:', e.message));
    }

    res.json(order);
  } catch (err) {
    await conn.rollback();
    console.error('Admin status update error →', err.message);
    res.status(500).json({ message: 'Failed to update status', error: err.message });
  } finally {
    conn.release();
  }
});

/* ─── ADMIN: Delete order ─── */
router.delete('/admin/:id', async (req, res) => {
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
    console.error('Admin order delete error →', err.message);
    res.status(500).json({ message: 'Failed to delete order', error: err.message });
  } finally {
    conn.release();
  }
});

/* ─── GENERATE UPI QR ─── */
router.get('/generate-qr/:id', async (req, res) => {
  const orderId = Number(req.params.id);
  if (!Number.isInteger(orderId)) return res.status(400).json({ message: 'Invalid order ID' });

  try {
    const [rows] = await pool.query('SELECT id, total FROM orders WHERE id = ?', [orderId]);
    if (!rows.length) return res.status(404).json({ message: 'Order not found' });

    const order = rows[0];

    const upiId = '9652296548@ybl';
    const payeeName = encodeURIComponent('Delicute');
    const amount = Number(order.total).toFixed(2);
    const txnNote = encodeURIComponent(`Order #${order.id}`);
    const currency = 'INR';
    const upiUrl = `upi://pay?pa=${upiId}&pn=${payeeName}&tn=${txnNote}&am=${amount}&cu=${currency}`;

    const qrDataUrl = await QRCode.toDataURL(upiUrl, { errorCorrectionLevel: 'H', scale: 8 });
    const img = Buffer.from(qrDataUrl.split(',')[1], 'base64');

    res.writeHead(200, { 'Content-Type': 'image/png', 'Content-Length': img.length });
    res.end(img);
  } catch (err) {
    console.error('QR generation error →', err.message);
    res.status(500).json({ message: 'Failed to generate QR code', error: err.message });
  }
});

/* ─── CUSTOMER: Get own orders ─── */
router.get('/myorders/:userId', async (req, res) => {
  const userId = Number(req.params.userId);
  if (!Number.isInteger(userId)) return res.status(400).json({ message: 'Invalid user ID' });

  try {
    const [orders] = await pool.query(
      'SELECT id, total, status, payment_status AS paymentStatus, payment_method AS paymentMethod, created_at FROM orders WHERE user_id = ? ORDER BY created_at DESC',
      [userId]
    );

    const withItems = await Promise.all(
      orders.map(async order => {
        const [items] = await pool.query('SELECT name, price, qty FROM order_items WHERE order_id = ?', [order.id]);
        return { ...order, items };
      })
    );

    res.json(withItems);
  } catch (err) {
    console.error('Customer orders fetch error →', err.message);
    res.status(500).json({ message: 'Failed to load orders', error: err.message });
  }
});

module.exports = router;
