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
          `SELECT name, price, qty 
             FROM order_items 
            WHERE order_id = ? 
         ORDER BY name`,
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
   (still uses orderUid internally for tracking/email)
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

    // Update payment_status only for COD when status is Delivered
    await conn.query(
      `UPDATE orders
          SET status = ?,
              cancel_reason = CASE WHEN ? = 'Cancelled' THEN ? ELSE NULL END,
              delivered_at = CASE WHEN ? = 'Delivered' THEN NOW() ELSE delivered_at END,
              payment_status = CASE 
                WHEN ? = 'Delivered' AND payment_method = 'COD' THEN 'PAID' 
                ELSE payment_status 
              END
        WHERE id = ?`,
      [status, status, reason || null, status, status, id]
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
        WHERE o.id = ?`,
      [id]
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

    // Send email only if a valid email exists
    if (order.email && order.email.includes('@')) {
      try {
        await sendOrderStatusEmail({
          to: order.email,
          name: order.customerName || 'Customer',
          orderId: order.orderUid,
          status: order.status,
          reason: order.cancel_reason || '',
        });
        console.log(`📧 Status email sent to ${order.email} for order #${order.orderUid}`);
      } catch (emailError) {
        console.error(`❌ Failed to send email to ${order.email}:`, emailError.message);
      }
    } else {
      console.warn(`⚠️ No valid email for order #${order.orderUid}`);
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
   (strictly uses numeric ID only)
   ═══════════════════════════════════════════════════════════ */
router.delete('/admin/:id', async (req, res) => {
  const { id } = req.params;
  const conn = await pool.getConnection();

  try {
    await conn.beginTransaction();

    const [[order]] = await conn.query(
      `SELECT id, orderUid FROM orders WHERE id = ?`,
      [id]
    );

    if (!order) {
      await conn.rollback();
      return res.status(404).json({ message: 'Order not found' });
    }

    // Delete items first
    await conn.query(`DELETE FROM order_items WHERE order_id = ?`, [order.id]);
    // Delete order
    await conn.query(`DELETE FROM orders WHERE id = ?`, [order.id]);

    await conn.commit();
    res.json({ success: true, deletedOrder: order.id });
  } catch (err) {
    await conn.rollback();
    console.error('Admin order delete error →', err.message);
    res.status(500).json({ message: 'Failed to delete order' });
  } finally {
    conn.release();
  }
});

module.exports = router;