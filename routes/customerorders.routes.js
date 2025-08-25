const express = require('express');
const pool = require('../db');

const router = express.Router();

/**
 * GET /api/customer-orders/user/:userId
 * Fetch all orders for a user with associated items.
 */
router.get('/user/:userId', async (req, res) => {
  const { userId } = req.params;
  try {
    const [orders] = await pool.query(
      `SELECT * FROM orders WHERE user_id = ? ORDER BY created_at DESC`,
      [userId]
    );

    for (const order of orders) {
      const [items] = await pool.query(
        `SELECT
           oi.id AS item_id,
           oi.product_id,
           oi.name,
           oi.qty AS quantity,
           oi.price,
           oi.rating AS item_rating,          -- NEW: surface per-item rating
           m.image_url AS menu_image,
           oi.image AS fallback_image
         FROM order_items oi
         LEFT JOIN menu_items m ON oi.product_id = m.id
         WHERE oi.order_id = ?
         ORDER BY oi.id ASC`,
        [order.id]
      );

      order.items = items.map(it => ({
        item_id: it.item_id,
        product_id: it.product_id,
        name: it.name,
        quantity: it.quantity,
        price: it.price,
        rating: it.item_rating ?? null,       // NEW
        image_url: it.menu_image || it.fallback_image || null,
      }));
    }

    res.json(orders);
  } catch (err) {
    console.error('[Fetch Orders]', err);
    res.status(500).json({ error: 'Failed to fetch orders' });
  }
});

/**
 * POST /api/customer-orders
 * Create a new order.
 */
router.post('/', async (req, res) => {
  const { userId, address, total, cartItems } = req.body;

  if (!userId || !address || !total || !Array.isArray(cartItems) || !cartItems.length) {
    return res.status(400).json({ error: 'Missing or invalid fields' });
  }

  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();

    const [orderResult] = await conn.query(
      `INSERT INTO orders (user_id, address, total, status, payment_status)
       VALUES (?, ?, ?, 'Pending', 'UNPAID')`,
      [userId, address, total]
    );

    const orderId = orderResult.insertId;

    const values = cartItems.map(it => [
      orderId,
      it.productId || null,
      it.name,
      Number(it.qty || it.quantity || 1),
      it.price,
      it.image_url || null
    ]);

    await conn.query(
      `INSERT INTO order_items (order_id, product_id, name, qty, price, image)
       VALUES ?`,
      [values]
    );

    await conn.commit();
    res.status(201).json({ success: true, orderId });
  } catch (err) {
    await conn.rollback();
    console.error('[Place Order Error]', err);
    res.status(500).json({ error: 'Failed to place order' });
  } finally {
    conn.release();
  }
});

/**
 * PATCH /api/customer-orders/:id/cancel
 * Cancel an order with reason if it's not already delivered or cancelled.
 */
router.patch('/:id/cancel', async (req, res) => {
  const { id } = req.params;
  const { reason } = req.body;

  if (!reason || !reason.trim()) {
    return res.status(400).json({ error: 'Cancellation reason is required' });
  }

  try {
    const [[order]] = await pool.query(
      `SELECT status FROM orders WHERE id = ?`,
      [id]
    );

    if (!order) return res.status(404).json({ error: 'Order not found' });

    if (!['Pending', 'Confirmed'].includes(order.status)) {
      return res.status(400).json({ error: `Cannot cancel order in '${order.status}' status` });
    }

    await pool.query(
      `UPDATE orders
       SET status = 'Cancelled', cancel_reason = ?
       WHERE id = ?`,
      [reason.trim(), id]
    );

    res.json({ success: true });
  } catch (err) {
    console.error('[Cancel Order Error]', err);
    res.status(500).json({ error: 'Failed to cancel order' });
  }
});

/**
 * POST /api/customer-orders/:id/rate
 * Submit a rating (1–5) for an order, with optional per-item ratings.
 * Body: { rating: 1..5, item_ratings?: [{ menu_item_id: number, rating: 1..5 }] }
 */
router.post('/:id/rate', async (req, res) => {
  const { id } = req.params;
  const { rating, item_ratings = [] } = req.body;

  if (!Number.isInteger(rating) || rating < 1 || rating > 5) {
    return res.status(400).json({ error: 'Rating must be an integer between 1 and 5' });
  }

  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();

    const [[existing]] = await conn.query(
      `SELECT id, rating FROM orders WHERE id = ? FOR UPDATE`,
      [id]
    );
    if (!existing) {
      await conn.rollback();
      return res.status(404).json({ error: 'Order not found' });
    }
    if (existing.rating) {
      await conn.rollback();
      return res.status(400).json({ error: 'You have already rated this order' });
    }

    // 1) Save overall order rating
    await conn.query(
      `UPDATE orders SET rating = ? WHERE id = ?`,
      [rating, id]
    );

    // 2) Save per-item ratings (optional)
    if (Array.isArray(item_ratings) && item_ratings.length) {
      for (const ir of item_ratings) {
        const r = Number(ir?.rating);
        const menuItemId = Number(ir?.menu_item_id);
        if (Number.isInteger(r) && r >= 1 && r <= 5 && Number.isInteger(menuItemId)) {
          await conn.query(
            `UPDATE order_items
             SET rating = ?
             WHERE order_id = ? AND product_id = ?`,
            [r, id, menuItemId]
          );
        }
      }
    }

    await conn.commit();
    res.json({ success: true, message: 'Rating saved' });
  } catch (err) {
    await conn.rollback();
    console.error('[Rate Order Error]', err);
    res.status(500).json({ error: 'Failed to rate order' });
  } finally {
    conn.release();
  }
});

module.exports = router;
