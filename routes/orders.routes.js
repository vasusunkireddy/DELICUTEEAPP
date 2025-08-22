const express = require('express');
const pool = require('../db');
const QRCode = require('qrcode'); // npm install qrcode
const { sendOrderStatusEmail } = require('../../utils/mailer');

const router = express.Router();

/* ═══════════════════════════════════════════════════════════
   GET /api/orders/admin – Admin order list
   ═══════════════════════════════════════════════════════════ */
router.get('/admin', async (_req, res) => {
  try {
    const [orders] = await pool.query(`
      SELECT
        o.id,
        o.user_id,
        o.address AS address_id,
        o.total,
        o.status,
        o.payment_method AS paymentMethod,
        o.payment_status AS paymentStatus,
        o.payment_id,
        COALESCE(a.receiver_name, u.full_name) AS customerName,
        COALESCE(a.receiver_phone, u.phone) AS phone,
        u.email,
        CONCAT(a.line1, ', ', IFNULL(a.city, ''), ' - ', a.pincode) AS address,
        o.created_at
      FROM orders o
      LEFT JOIN addresses a ON a.id = o.address
      LEFT JOIN users u ON u.id = o.user_id
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

    res.json(withItems);
  } catch (err) {
    console.error('Admin orders fetch error →', err.message);
    res.status(500).json({ message: 'Failed to load orders' });
  }
});

/* ═══════════════════════════════════════════════════════════
   PATCH /api/orders/admin/:id/status – update status
   ═══════════════════════════════════════════════════════════ */
router.patch('/admin/:id/status', async (req, res) => {
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
              COALESCE(a.receiver_name, u.full_name) AS customerName,
              COALESCE(a.receiver_phone, u.phone) AS phone,
              u.email,
              CONCAT(a.line1, ', ', IFNULL(a.city, ''), ' - ', a.pincode) AS address
         FROM orders o
         LEFT JOIN addresses a ON a.id = o.address
         LEFT JOIN users u ON u.id = o.user_id
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
    console.error('Admin status update error →', err.message);
    res.status(500).json({ message: 'Failed to update status' });
  } finally {
    conn.release();
  }
});

/* ═══════════════════════════════════════════════════════════
   DELETE /api/orders/admin/:id – delete order + items
   ═══════════════════════════════════════════════════════════ */
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
    res.status(500).json({ message: 'Failed to delete order' });
  } finally {
    conn.release();
  }
});

/* ═══════════════════════════════════════════════════════════
   GET /api/orders/generate-qr/:orderId – Generate dynamic UPI QR
   ═══════════════════════════════════════════════════════════ */
router.get('/generate-qr/:orderId', async (req, res) => {
  const { orderId } = req.params;
  console.log(`Received QR code request for orderId=${orderId}`); // Debug log
  try {
    // Fetch order details
    const [[order]] = await pool.query(
      `SELECT id, total FROM orders WHERE id = ?`,
      [orderId]
    );

    if (!order) {
      console.log(`Order not found: orderId=${orderId}`);
      return res.status(404).json({ message: 'Order not found' });
    }

    // UPI Payment details
    const upiId = '9652296548@ybl'; // Your correct UPI ID
    const payeeName = encodeURIComponent('Delicute'); // Encode merchant name
    const amount = Number(order.total).toFixed(2); // Ensure amount is a number with 2 decimal places
    const txnNote = encodeURIComponent(`Order #${order.id}`); // Encode transaction note
    const currency = 'INR';

    // Construct UPI payment URL
    const upiUrl = `upi://pay?pa=${upiId}&pn=${payeeName}&tn=${txnNote}&am=${amount}&cu=${currency}`;
    console.log(`Generated UPI URL: ${upiUrl}`); // Debug log

    // Generate QR as Data URL
    const qrDataUrl = await QRCode.toDataURL(upiUrl, {
      errorCorrectionLevel: 'H', // High error correction for robustness
      type: 'image/png',
      margin: 2,
      scale: 8, // Increase scale for better readability
    });

    // Convert Data URL to image response
    const img = Buffer.from(qrDataUrl.split(',')[1], 'base64');
    res.writeHead(200, {
      'Content-Type': 'image/png',
      'Content-Length': img.length,
    });
    res.end(img);
  } catch (err) {
    console.error('QR generation error →', err.message);
    res.status(500).json({ message: 'Failed to generate QR code' });
  }
});

module.exports = router;