const express = require('express');
const router = express.Router();
const db = require('../config/db');
const { v4: uuidv4 } = require('uuid');

// Pass Socket.IO instance to routes
module.exports = (io) => {
  // Helper to emit new order event
  const notifyNewOrder = (order, items) => {
    try {
      io.emit('newOrder', {
        order_id: order.id,
        user_id: order.user_id,
        total: order.total,
        status: order.status,
        orderUid: order.orderUid,
        items,
      });
    } catch (err) {
      console.error('[customerorders.routes] Failed to emit newOrder:', err.message);
    }
  };

  // POST /api/customer-orders/:id/reorder
  router.post('/:id/reorder', async (req, res) => {
    const { id } = req.params;
    const userId = req.user ? req.user.id : null; // Assuming JWT middleware sets req.user

    try {
      // Validate order exists and belongs to user
      const [orders] = await db.query('SELECT * FROM orders WHERE id = ? AND user_id = ?', [id, userId]);
      if (orders.length === 0) {
        return res.status(404).json({ error: 'Order not found' });
      }
      const order = orders[0];

      // Fetch order items
      const [orderItems] = await db.query('SELECT * FROM order_items WHERE order_id = ?', [id]);
      if (!orderItems.length) {
        return res.status(400).json({ error: 'No items found in order' });
      }

      // Check item availability in menu_items
      const items = [];
      const unavailableItems = [];
      const priceChanges = [];
      let total = 0;

      for (const item of orderItems) {
        const [menuItems] = await db.query('SELECT * FROM menu_items WHERE id = ? AND available = 1', [item.product_id]);
        if (menuItems.length === 0) {
          unavailableItems.push(item.name);
          continue;
        }
        const menuItem = menuItems[0];
        const itemTotal = menuItem.price * item.qty;
        total += itemTotal;

        // Check for price changes
        if (menuItem.price !== item.price) {
          priceChanges.push({
            name: item.name,
            old_price: item.price,
            new_price: menuItem.price,
          });
        }

        items.push({
          product_id: menuItem.id,
          name: menuItem.name,
          quantity: item.qty,
          price: menuItem.price,
          image_url: menuItem.image_url || item.image,
        });
      }

      if (unavailableItems.length > 0) {
        return res.status(400).json({
          error: 'Some items are unavailable',
          unavailable_items: unavailableItems,
        });
      }

      if (items.length === 0) {
        return res.status(400).json({ error: 'No valid items to reorder' });
      }

      // Create new order
      const orderUid = uuidv4();
      const [orderResult] = await db.query(
        'INSERT INTO orders (user_id, address, total, status, payment_method, payment_status, orderUid, created_at, customer_name) VALUES (?, ?, ?, ?, ?, ?, ?, NOW(), ?)',
        [
          order.user_id,
          order.address,
          total,
          'pending',
          order.payment_method,
          order.payment_status || 'UNPAID',
          orderUid,
          order.customer_name || null,
        ]
      );
      const newOrderId = orderResult.insertId;

      // Insert order items
      for (const item of items) {
        await db.query(
          'INSERT INTO order_items (order_id, product_id, name, qty, price, image) VALUES (?, ?, ?, ?, ?, ?)',
          [newOrderId, item.product_id, item.name, item.quantity, item.price, item.image_url]
        );
      }

      // Emit new order event
      notifyNewOrder({ id: newOrderId, user_id: order.user_id, total, status: 'pending', orderUid }, items);

      res.json({
        ok: true,
        new_order_id: newOrderId,
        orderUid,
        total,
        items,
        price_changes: priceChanges,
      });
    } catch (err) {
      console.error('[customerorders.routes] Reorder error:', err.message);
      res.status(500).json({ error: 'Failed to process reorder' });
    }
  });

  // Other routes (assumed unchanged)
  router.get('/user/:userId', async (req, res) => {
    // ... fetch user orders ...
  });

  router.patch('/:id/cancel', async (req, res) => {
    // ... cancel order ...
  });

  router.post('/:id/rate', async (req, res) => {
    // ... rate order ...
  });

  return router;
};