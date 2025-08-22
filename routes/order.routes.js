const express = require('express');
const pool = require('../db');
const { sendOrderStatusEmail } = require('../utils/mailer');

const router = express.Router();

/* ═══════════════════════════════════════════════════════════
   GET /api/orders/admin – Admin order list
   ═══════════════════════════════════════════════════════════ */
router.get('/admin', async (_req, res) => {
  try {
    const [orders] = await pool.query(`
      SELECT
        o.id,
        o.orderUid,
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
        a.line1, a.houseNo, a.floorNo, a.towerNo, a.building, a.label, a.city, a.state, a.pincode,
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
   PATCH /api/orders/admin/:orderUid/status – update status
   ═══════════════════════════════════════════════════════════ */
router.patch('/admin/:orderUid/status', async (req, res) => {
  const { orderUid } = req.params;
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
       WHERE orderUid = ?`,
      [status, status, reason || null, status, status, orderUid]
    );

    const [[order]] = await conn.query(
      `SELECT o.id, o.orderUid, o.total, o.status, o.cancel_reason,
              o.payment_method AS paymentMethod,
              o.payment_status AS paymentStatus,
              o.payment_id,
              COALESCE(a.receiver_name, u.full_name) AS customerName,
              COALESCE(a.receiver_phone, u.phone) AS phone,
              u.email,
              a.line1, a.houseNo, a.floorNo, a.towerNo, a.building, a.label, a.city, a.state, a.pincode
         FROM orders o
         LEFT JOIN addresses a ON a.id = o.address
         LEFT JOIN users u ON u.id = o.user_id
         WHERE o.orderUid = ?`,
      [orderUid]
    );

    if (!order) {
      throw new Error('Order not found');
    }

    const [items] = await conn.query(
      `SELECT name, price, qty FROM order_items WHERE order_id = ? ORDER BY name`,
      [order.id]
    );
    order.items = items;

    await conn.commit();

    if (order.email) {
      sendOrderStatusEmail({
        to: order.email,
        name: order.customerName,
        orderId: order.orderUid,
        status: order.status,
        reason: order.cancel_reason || '',
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
   DELETE /api/orders/admin/:orderUid – delete order + items
   ═══════════════════════════════════════════════════════════ */
router.delete('/admin/:orderUid', async (req, res) => {
  const { orderUid } = req.params;
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    const [[order]] = await conn.query(`SELECT id FROM orders WHERE orderUid = ?`, [orderUid]);
    if (!order) {
      throw new Error('Order not found');
    }
    await conn.query('DELETE FROM order_items WHERE order_id = ?', [order.id]);
    await conn.query('DELETE FROM orders WHERE orderUid = ?', [orderUid]);
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

module.exports = router;