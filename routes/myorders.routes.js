const express = require('express');
const jwt = require('jsonwebtoken');
const pool = require('../db');
const { v4: uuidv4 } = require('uuid');

const router = express.Router();

/* ------------------------ Auth Middleware ------------------------ */
function verifyToken(req, res, next) {
  let token = (req.headers.authorization || '').replace(/^Bearer\s+/i, '');
  if (!token && req.cookies) token = req.cookies.token;
  if (!token) return res.status(401).json({ error: 'Auth token missing' });

  try {
    const payload = jwt.verify(token, process.env.JWT_SECRET);
    req.user = { id: payload.id, role: payload.role };
    next();
  } catch (e) {
    console.error('[orders] Invalid token:', e.message);
    return res.status(401).json({ error: 'Invalid or expired token' });
  }
}
router.use(verifyToken);

/* ------------------------ Helpers ------------------------ */
function toInt(val, def = null) {
  const n = Number.parseInt(val, 10);
  return Number.isFinite(n) ? n : def;
}

function toFloat(val, def = null) {
  const n = Number.parseFloat(val);
  return Number.isFinite(n) ? n : def;
}

/* ------------------------ GET /menu-items ------------------------ */
router.get('/menu-items', async (req, res) => {
  try {
    const [menuItems] = await pool.query(
      `SELECT id, name, price, image_url, available 
       FROM menu_items 
       WHERE available = 1`
    );

    const baseUrl = 'https://delicuteeapp.onrender.com';
    const normalizedItems = menuItems.map(item => ({
      product_id: toInt(item.id),
      name: item.name || 'Unknown Item',
      price: toFloat(item.price, 0),
      image_url: item.image_url || '',
      available: item.available === 1
    }));

    console.log(`[orders] GET /menu-items - Fetched ${normalizedItems.length} available menu items`);
    res.set('Cache-Control', 'no-cache, no-store, must-revalidate');
    return res.status(200).json(normalizedItems);
  } catch (err) {
    console.error('[orders] GET /menu-items error:', err);
    return res.status(500).json({ error: 'Internal server error', details: err.message });
  }
});

/* ------------------------ GET /customer-orders/user/:userId ------------------------ */
router.get('/user/:userId', async (req, res) => {
  try {
    const userId = toInt(req.params.userId);
    if (!userId || userId <= 0 || userId !== req.user.id) {
      return res.status(403).json({ error: 'Unauthorized access to user orders' });
    }

    const [orders] = await pool.query(
      `SELECT 
         o.id, 
         o.orderUid, 
         o.status, 
         o.total, 
         o.created_at, 
         o.rating, 
         o.address, 
         o.payment_method, 
         o.payment_status, 
         o.payment_id, 
         JSON_ARRAYAGG(
           JSON_OBJECT(
             'product_id', COALESCE(oi.product_id, mi.id, 0),
             'quantity', oi.qty,
             'price', oi.price,
             'name', oi.name,
             'image_url', COALESCE(oi.image, mi.image_url, '')
           )
         ) AS items
       FROM orders o
       LEFT JOIN order_items oi ON o.id = oi.order_id
       LEFT JOIN menu_items mi ON oi.name = mi.name
       WHERE o.user_id = ?
       GROUP BY o.id, o.orderUid, o.status, o.total, o.created_at, o.rating, o.address, o.payment_method, o.payment_status, o.payment_id
       ORDER BY o.created_at DESC`,
      [userId]
    );

    const baseUrl = 'https://delicuteeapp.onrender.com';
    const normalizedOrders = orders.map(order => ({
      ...order,
      orderUid: order.orderUid || null,
      items: order.items && order.items !== 'null' ? JSON.parse(order.items).map(item => ({
        ...item,
        product_id: toInt(item.product_id, 0),
        quantity: toInt(item.quantity, 1),
        price: toFloat(item.price, 0),
        name: item.name || 'Unknown Item',
        image_url: item.image_url && item.image_url.startsWith('/') 
          ? `${baseUrl}${item.image_url}` 
          : item.image_url || ''
      })) : [],
      total: toFloat(order.total, 0),
      rating: toInt(order.rating, null),
      address: order.address || '',
      payment_method: order.payment_method || 'COD',
      payment_status: order.payment_status || 'UNPAID',
      payment_id: order.payment_id || null
    }));

    console.log(`[orders] GET /user/:userId - Fetched ${normalizedOrders.length} orders for user ${userId}`, {
      orders: normalizedOrders.map(o => ({ id: o.id, items: o.items.map(i => ({ product_id: i.product_id, name: i.name })) }))
    });
    res.set('Cache-Control', 'no-cache, no-store, must-revalidate');
    return res.status(200).json(normalizedOrders);
  } catch (err) {
    console.error('[orders] GET /user/:userId error:', err);
    return res.status(500).json({ error: 'Internal server error', details: err.message });
  }
});

/* ------------------------ POST /customer-orders ------------------------ */
router.post('/', async (req, res) => {
  try {
    const { user_id, address, total, status, payment_method, payment_status, payment_id } = req.body;
    const userId = toInt(user_id);
    const orderTotal = toFloat(total, 0);
    const orderStatus = (status || 'Pending').toLowerCase();
    const orderAddress = (address || '').trim();
    const orderPaymentMethod = (payment_method || 'COD').trim();
    const orderPaymentStatus = (payment_status || 'UNPAID').toUpperCase();
    const orderPaymentId = payment_id || null;
    const orderUid = uuidv4();

    if (!userId || userId <= 0 || userId !== req.user.id) {
      return res.status(403).json({ error: 'Unauthorized to create order' });
    }
    if (!orderAddress) {
      return res.status(400).json({ error: 'Address is required' });
    }
    if (orderTotal <= 0) {
      return res.status(400).json({ error: 'Invalid order total' });
    }
    if (!['pending', 'processing', 'confirmed', 'shipped', 'delivered', 'cancelled'].includes(orderStatus)) {
      return res.status(400).json({ error: 'Invalid order status' });
    }
    if (!['COD', 'online'].includes(orderPaymentMethod.toLowerCase())) {
      return res.status(400).json({ error: 'Invalid payment method' });
    }
    if (!['UNPAID', 'PAID', 'SUCCESS'].includes(orderPaymentStatus)) {
      return res.status(400).json({ error: 'Invalid payment status' });
    }

    const [result] = await pool.query(
      `INSERT INTO orders (orderUid, user_id, address, total, status, payment_method, payment_status, payment_id, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, NOW())`,
      [orderUid, userId, orderAddress, orderTotal, orderStatus, orderPaymentMethod, orderPaymentStatus, orderPaymentId]
    );

    console.log(`[orders] POST / - Created order ${result.insertId} for user ${userId}`);
    return res.status(201).json({ id: result.insertId, orderUid, ok: true });
  } catch (err) {
    console.error('[orders] POST / error:', err);
    return res.status(500).json({ error: 'Internal server error', details: err.message });
  }
});

/* ------------------------ POST /order-items ------------------------ */
router.post('/order-items', async (req, res) => {
  try {
    const { order_id, product_id, name, qty, price, image } = req.body;
    const orderId = toInt(order_id);
    const productId = toInt(product_id);
    const quantity = toInt(qty, 1);
    const itemPrice = toFloat(price, 0);
    const itemName = (name || '').trim();
    const itemImage = (image || '').trim();

    if (!orderId || orderId <= 0) {
      return res.status(400).json({ error: 'Invalid order ID' });
    }
    if (!productId || productId <= 0) {
      return res.status(400).json({ error: 'Invalid product ID' });
    }
    if (!itemName) {
      return res.status(400).json({ error: 'Item name is required' });
    }
    if (quantity <= 0) {
      return res.status(400).json({ error: 'Invalid quantity' });
    }
    if (itemPrice <= 0) {
      return res.status(400).json({ error: 'Invalid price' });
    }

    const [orderRows] = await pool.query(
      `SELECT user_id FROM orders WHERE id = ? LIMIT 1`,
      [orderId]
    );
    if (!orderRows.length || orderRows[0].user_id !== req.user.id) {
      return res.status(403).json({ error: 'Unauthorized to add items to this order' });
    }

    await pool.query(
      `INSERT INTO order_items (order_id, product_id, name, qty, price, image)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [orderId, productId, itemName, quantity, itemPrice, itemImage]
    );

    console.log(`[orders] POST /order-items - Added item ${itemName} to order ${orderId}`);
    return res.status(201).json({ ok: true });
  } catch (err) {
    console.error('[orders] POST /order-items error:', err);
    return res.status(500).json({ error: 'Internal server error', details: err.message });
  }
});

/* ------------------------ PATCH /customer-orders/:orderId/cancel ------------------------ */
router.patch('/:orderId/cancel', async (req, res) => {
  try {
    const orderId = toInt(req.params.orderId);
    const reason = (req.body.reason || '').trim();
    if (!orderId || orderId <= 0) {
      return res.status(400).json({ error: 'Invalid order ID' });
    }
    if (!reason) {
      return res.status(400).json({ error: 'Cancellation reason is required' });
    }

    const [orderRows] = await pool.query(
      `SELECT user_id, status, created_at 
       FROM orders 
       WHERE id = ? LIMIT 1`,
      [orderId]
    );

    if (!orderRows.length) {
      return res.status(404).json({ error: 'Order not found' });
    }

    const order = orderRows[0];
    if (order.user_id !== req.user.id) {
      return res.status(403).json({ error: 'Unauthorized to cancel this order' });
    }

    const validStatuses = ['pending', 'processing', 'confirmed', 'shipped'];
    if (!validStatuses.includes(order.status.toLowerCase())) {
      return res.status(400).json({ error: 'Order cannot be canceled due to its current status' });
    }

    const CANCEL_WINDOW_MS = 10 * 60 * 1000; // 10 minutes
    const msSinceCreated = Date.now() - new Date(order.created_at).getTime();
    if (msSinceCreated > CANCEL_WINDOW_MS) {
      return res.status(400).json({ error: 'Cancellation window has expired' });
    }

    const conn = await pool.getConnection();
    try {
      await conn.beginTransaction();
      await conn.query(
        `UPDATE orders 
         SET status = 'cancelled', cancel_reason = ? 
         WHERE id = ? AND user_id = ?`,
        [reason, orderId, req.user.id]
      );
      await conn.commit();
      conn.release();
      console.log(`[orders] PATCH /:orderId/cancel - Order ${orderId} cancelled successfully`);
      return res.status(200).json({ ok: true });
    } catch (e) {
      await conn.rollback();
      conn.release();
      throw e;
    }
  } catch (err) {
    console.error('[orders] PATCH /:orderId/cancel error:', err);
    return res.status(500).json({ error: 'Internal server error', details: err.message });
  }
});

/* ------------------------ POST /customer-orders/:orderId/rate ------------------------ */
router.post('/:orderId/rate', async (req, res) => {
  try {
    const orderId = toInt(req.params.orderId);
    const rating = toInt(req.body.rating);

    if (!orderId || orderId <= 0) {
      return res.status(400).json({ error: 'Invalid order ID' });
    }
    if (!rating || rating < 1 || rating > 5) {
      return res.status(400).json({ error: 'Rating must be between 1 and 5' });
    }

    const [orderRows] = await pool.query(
      `SELECT user_id, status, rating 
       FROM orders 
       WHERE id = ? LIMIT 1`,
      [orderId]
    );

    if (!orderRows.length) {
      return res.status(404).json({ error: 'Order not found' });
    }

    const order = orderRows[0];
    if (order.user_id !== req.user.id) {
      return res.status(403).json({ error: 'Unauthorized to rate this order' });
    }
    if (order.status.toLowerCase() !== 'delivered') {
      return res.status(400).json({ error: 'Order must be delivered to rate' });
    }
    if (order.rating && order.rating >= 1) {
      return res.status(400).json({ error: 'Order already rated' });
    }

    await pool.query(
      `UPDATE orders 
       SET rating = ? 
       WHERE id = ? AND user_id = ?`,
      [rating, orderId, req.user.id]
    );

    console.log(`[orders] POST /:orderId/rate - Order ${orderId} rated ${rating} successfully`);
    return res.status(200).json({ ok: true });
  } catch (err) {
    console.error('[orders] POST /:orderId/rate error:', err);
    return res.status(500).json({ error: 'Internal server error', details: err.message });
  }
});

/* ------------------------ POST /customer-orders/:orderId/reorder ------------------------ */
router.post('/:orderId/reorder', async (req, res) => {
  try {
    const orderId = toInt(req.params.orderId);
    if (!orderId || orderId <= 0) {
      return res.status(400).json({ error: 'Invalid order ID' });
    }

    // Fetch original order details
    const [orderRows] = await pool.query(
      `SELECT user_id, address, payment_method, payment_status, payment_id
       FROM orders 
       WHERE id = ? LIMIT 1`,
      [orderId]
    );

    if (!orderRows.length) {
      return res.status(404).json({ error: 'Order not found' });
    }

    const order = orderRows[0];
    if (order.user_id !== req.user.id) {
      return res.status(403).json({ error: 'Unauthorized to reorder this order' });
    }

    // Fetch order items
    const [orderItems] = await pool.query(
      `SELECT name, qty, price, image
       FROM order_items 
       WHERE order_id = ?`,
      [orderId]
    );

    if (!orderItems.length) {
      return res.status(400).json({ error: 'No items found in the order' });
    }

    // Check item availability and price updates
    const unavailableItems = [];
    const priceChanges = [];
    let newTotal = 0;

    const validatedItems = [];
    for (const item of orderItems) {
      const [menuItemRows] = await pool.query(
        `SELECT id, name, price, image_url, available 
         FROM menu_items 
         WHERE name = ? AND available = 1 LIMIT 1`,
        [item.name]
      );

      if (!menuItemRows.length) {
        unavailableItems.push(item.name);
        continue;
      }

      const menuItem = menuItemRows[0];
      if (menuItem.price !== item.price) {
        priceChanges.push({
          name: item.name,
          old_price: item.price,
          new_price: menuItem.price
        });
      }

      newTotal += menuItem.price * item.qty;
      validatedItems.push({
        product_id: menuItem.id,
        name: menuItem.name,
        qty: item.qty,
        price: menuItem.price,
        image: menuItem.image_url || item.image || ''
      });
    }

    if (unavailableItems.length > 0) {
      return res.status(400).json({
        error: 'Some items are unavailable',
        unavailable_items: unavailableItems
      });
    }

    // Create new order in a transaction
    const conn = await pool.getConnection();
    try {
      await conn.beginTransaction();

      // Insert new order
      const orderUid = uuidv4();
      const [orderResult] = await conn.query(
        `INSERT INTO orders (orderUid, user_id, address, total, status, payment_method, payment_status, payment_id, created_at)
         VALUES (?, ?, ?, ?, 'Pending', ?, ?, ?, NOW())`,
        [orderUid, req.user.id, order.address, newTotal, order.payment_method, order.payment_status, order.payment_id]
      );

      const newOrderId = orderResult.insertId;

      // Insert order items
      for (const item of validatedItems) {
        await conn.query(
          `INSERT INTO order_items (order_id, product_id, name, qty, price, image)
           VALUES (?, ?, ?, ?, ?, ?)`,
          [newOrderId, item.product_id, item.name, item.qty, item.price, item.image]
        );
      }

      await conn.commit();
      conn.release();

      console.log(`[orders] POST /:orderId/reorder - Order ${orderId} reordered as new order ${newOrderId} for user ${req.user.id}`);
      return res.status(201).json({
        ok: true,
        new_order_id: newOrderId,
        orderUid,
        total: newTotal,
        price_changes: priceChanges,
        items: validatedItems.map(item => ({
          product_id: item.product_id,
          name: item.name,
          quantity: item.qty,
          price: item.price,
          image_url: item.image
        }))
      });
    } catch (e) {
      await conn.rollback();
      conn.release();
      throw e;
    }
  } catch (err) {
    console.error('[orders] POST /:orderId/reorder error:', err);
    return res.status(500).json({ error: 'Internal server error', details: err.message });
  }
});

/* ------------------------ Global Error Handler ------------------------ */
router.use((err, req, res, next) => {
  console.error('[orders] Unhandled error:', err);
  res.status(500).json({ error: 'Internal server error', details: err.message });
});

module.exports = router;