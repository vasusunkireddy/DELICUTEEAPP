const express = require('express');
const jwt = require('jsonwebtoken');
const pool = require('../db');

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
         o.status, 
         o.total, 
         o.created_at, 
         o.rating,
         COALESCE(
           JSON_ARRAYAGG(
             JSON_OBJECT(
               'menu_item_id', COALESCE(oi.product_id, oi.id),
               'quantity', oi.qty,
               'price', oi.price,
               'name', oi.name,
               'image_url', COALESCE(oi.image, mi.image_url, ''),
               'is_available', COALESCE(mi.available, 1)
             )
           ) FILTER (WHERE oi.id IS NOT NULL),
           '[]'
         ) AS items
       FROM orders o
       LEFT JOIN order_items oi ON o.id = oi.order_id
       LEFT JOIN menu_items mi ON oi.product_id = mi.id
       WHERE o.user_id = ?
       GROUP BY o.id, o.status, o.total, o.created_at, o.rating
       ORDER BY o.created_at DESC`,
      [userId]
    );

    // Normalize response to ensure items is always an array and image_url is absolute
    const baseUrl = 'https://delicuteeapp.onrender.com';
    const normalizedOrders = orders.map(order => {
      let items = [];
      try {
        // Ensure items is a string and parse it, default to empty array if invalid
        if (typeof order.items === 'string' && order.items !== 'null') {
          items = JSON.parse(order.items);
        }
      } catch (e) {
        console.error(`[orders] Failed to parse items for order ${order.id}:`, e.message);
        items = [];
      }

      return {
        ...order,
        items: Array.isArray(items) ? items.map(item => ({
          ...item,
          menu_item_id: toInt(item.menu_item_id, 0),
          quantity: toInt(item.quantity, 1),
          price: toFloat(item.price, 0),
          name: item.name || 'Unknown Item',
          image_url: item.image_url && item.image_url.startsWith('/') 
            ? `${baseUrl}${item.image_url}` 
            : item.image_url || '',
          is_available: item.is_available !== undefined ? Boolean(item.is_available) : true
        })) : [],
        total: toFloat(order.total, 0),
        rating: toInt(order.rating),
      };
    });

    console.log(`[orders] GET /user/:userId - Fetched ${normalizedOrders.length} orders for user ${userId}`, {
      orders: normalizedOrders.map(o => ({ id: o.id, items: o.items.map(i => ({ menu_item_id: i.menu_item_id, name: i.name, is_available: i.is_available })) }))
    });
    res.set('Cache-Control', 'no-cache, no-store, must-revalidate');
    return res.status(200).json(normalizedOrders);
  } catch (err) {
    console.error('[orders] GET /user/:userId error:', err);
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

/* ------------------------ GET /menu-items ------------------------ */
router.get('/menu-items', async (req, res) => {
  try {
    const [menuItems] = await pool.query(
      `SELECT 
         id,
         name,
         price,
         image_url,
         available,
         category_id
       FROM menu_items
       WHERE available = 1
       ORDER BY id`
    );

    const normalizedItems = menuItems.map(item => ({
      id: toInt(item.id),
      name: item.name || 'Unknown Item',
      price: toFloat(item.price, 0),
      image_url: item.image_url && item.image_url.startsWith('/')
        ? `https://delicuteeapp.onrender.com${item.image_url}`
        : item.image_url || '',
      available: Boolean(item.available),
      category_id: toInt(item.category_id),
    }));

    console.log(`[orders] GET /menu-items - Fetched ${normalizedItems.length} menu items`);
    res.set('Cache-Control', 'no-cache, no-store, must-revalidate');
    return res.status(200).json(normalizedItems);
  } catch (err) {
    console.error('[orders] GET /menu-items error:', err);
    return res.status(500).json({ error: 'Internal server error', details: err.message });
  }
});

/* ------------------------ POST /cart-items ------------------------ */
router.post('/cart-items', async (req, res) => {
  try {
    const {
      user_id,
      menu_item_id,
      quantity,
      name,
      price,
      image_url,
      category_id,
    } = req.body;

    if (!user_id || user_id !== req.user.id) {
      return res.status(403).json({ error: 'Unauthorized user ID' });
    }
    if (!menu_item_id || toInt(menu_item_id) <= 0) {
      return res.status(400).json({ error: 'Invalid menu item ID' });
    }
    if (!quantity || toInt(quantity) <= 0) {
      return res.status(400).json({ error: 'Invalid quantity' });
    }
    if (!name || typeof name !== 'string') {
      return res.status(400).json({ error: 'Invalid item name' });
    }
    if (!price || toFloat(price) <= 0) {
      return res.status(400).json({ error: 'Invalid price' });
    }

    const [menuItemRows] = await pool.query(
      `SELECT id, available 
       FROM menu_items 
       WHERE id = ? LIMIT 1`,
      [menu_item_id]
    );

    if (!menuItemRows.length || !menuItemRows[0].available) {
      return res.status(400).json({ error: `Menu item ${name} is not available` });
    }

    const conn = await pool.getConnection();
    try {
      await conn.beginTransaction();
      await conn.query(
        `INSERT INTO cart_items (
          user_id,
          menu_item_id,
          quantity,
          name,
          price,
          image_url,
          category_id
        ) VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [
          user_id,
          menu_item_id,
          toInt(quantity),
          name,
          toFloat(price),
          image_url || '',
          toInt(category_id),
        ]
      );
      await conn.commit();
      conn.release();
      console.log(`[orders] POST /cart-items - Added item ${menu_item_id} for user ${user_id}`);
      return res.status(201).json({ ok: true });
    } catch (e) {
      await conn.rollback();
      conn.release();
      throw e;
    }
  } catch (err) {
    console.error('[orders] POST /cart-items error:', err);
    return res.status(500).json({ error: 'Internal server error', details: err.message });
  }
});

/* ------------------------ Global Error Handler ------------------------ */
router.use((err, req, res, next) => {
  console.error('[orders] Unhandled error:', err);
  res.status(500).json({ error: 'Internal server error', details: err.message });
});

module.exports = router;