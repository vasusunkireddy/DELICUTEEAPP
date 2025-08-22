const express = require('express');
const pool = require('../db'); // your MySQL pool
const QRCode = require('qrcode');
const { sendOrderStatusEmail } = require('../../utils/mailer');

const router = express.Router();

// -------------------- Admin: Get all orders --------------------
router.get('/admin', async (_req, res) => {
  try {
    // Fetch all orders
    const [orders] = await pool.query(`
      SELECT 
        id,
        orderUid,
        user_id,
        customer_name,
        phone,
        address,
        total,
        status,
        payment_method AS paymentMethod,
        payment_status AS paymentStatus,
        payment_id,
        delivered_at,
        cancel_reason,
        created_at
      FROM orders
      ORDER BY created_at DESC
    `);

    // Fetch items for each order
    const withItems = await Promise.all(
      orders.map(async (order) => {
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

// -------------------- Admin: Update order status --------------------
router.patch('/admin/:id/status', async (req, res) => {
  const { id } = req.params;
  const { status, reason } = req.body;

  if (!status) return res.status(400).json({ message: 'Status is required' });
  if (status === 'Cancelled' && !reason)
    return res.status(400).json({ message: 'Reason required for cancellation' });

  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();

    // Update order
    await conn.query(
      `UPDATE orders
         SET status = ?,
             cancel_reason = CASE WHEN ? = 'Cancelled' THEN ? ELSE NULL END,
             delivered_at = CASE WHEN ? = 'Delivered' THEN NOW() ELSE delivered_at END,
             payment_status = CASE WHEN ? = 'Delivered' THEN 'PAID' ELSE payment_status END
       WHERE id = ?`,
      [status, status, reason || null, status, status, id]
    );

    // Fetch updated order
    const [[order]] = await conn.query(
      `SELECT 
        id,
        orderUid,
        customer_name,
        phone,
        address,
        total,
        status,
        payment_method AS paymentMethod,
        payment_status AS paymentStatus,
        payment_id,
        delivered_at,
        cancel_reason,
        created_at
       FROM orders WHERE id = ?`,
      [id]
    );

    // Fetch items
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
        name: order.customer_name,
        orderId: order.id,
        status: order.status,
        reason: reason || '',
      }).catch((e) => console.warn('Email failed:', e.message));
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

// -------------------- Admin: Delete order --------------------
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

// -------------------- Generate UPI QR --------------------
router.get('/generate-qr/:orderId', async (req, res) => {
  const { orderId } = req.params;
  try {
    const orderIdNum = Number(orderId);
    if (!Number.isInteger(orderIdNum)) return res.status(400).json({ message: 'Invalid order ID' });

    const [rows] = await pool.query(
      'SELECT id, total, customer_name, phone FROM orders WHERE id = ?',
      [orderIdNum]
    );

    if (!rows.length) return res.status(404).json({ message: 'Order not found' });

    const order = rows[0];

    const upiId = '9652296548@ybl';
    const payeeName = encodeURIComponent('Delicute');
    const amount = Number(order.total).toFixed(2);
    const txnNote = encodeURIComponent(`Order #${order.id}`);
    const currency = 'INR';

    const upiUrl = `upi://pay?pa=${upiId}&pn=${payeeName}&tn=${txnNote}&am=${amount}&cu=${currency}`;
    const qrDataUrl = await QRCode.toDataURL(upiUrl, { errorCorrectionLevel: 'H', type: 'image/png', margin: 2, scale: 8 });
    const img = Buffer.from(qrDataUrl.split(',')[1], 'base64');

    res.writeHead(200, {
      'Content-Type': 'image/png',
      'Content-Length': img.length,
    });
    res.end(img);
  } catch (err) {
    console.error('QR generation error →', err);
    res.status(500).json({ message: 'Failed to generate QR code', error: err.message });
  }
});

module.exports = router;
