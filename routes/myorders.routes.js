const express = require('express');
const router = express.Router();
const pool = require('../db');

router.get('/user/:userId', async (req, res) => {
  const { userId } = req.params;

  try {
    const [orders] = await pool.query(
      `SELECT id, total, status, created_at, delivered_at, rating, review 
       FROM orders 
       WHERE user_id = ? 
       ORDER BY created_at DESC`,
      [userId]
    );

    if (!orders.length) return res.status(200).json([]);

    const orderIds = orders.map(o => o.id);

    const [items] = await pool.query(
      `SELECT 
         oi.id AS item_id,
         oi.order_id,
         oi.product_id,
         oi.qty AS quantity,
         oi.price,
         oi.name AS item_name,
         oi.image AS item_image,
         m.name AS menu_name,
         m.image_url AS menu_image_url
       FROM order_items oi
       LEFT JOIN menu_items m ON oi.product_id = m.id
       WHERE oi.order_id IN (?)`,
      [orderIds]
    );

    const itemsByOrder = items.reduce((acc, item) => {
      const imageUrl = item.menu_image_url || item.item_image || null;
      const formattedImage = imageUrl?.startsWith('/') ? `http://192.168.1.4:3000${imageUrl}` : imageUrl;

      if (!acc[item.order_id]) acc[item.order_id] = [];
      acc[item.order_id].push({
        item_id: item.item_id,
        product_id: item.product_id,
        name: item.menu_name || item.item_name || 'Unnamed',
        quantity: item.quantity || 1,
        price: parseFloat(item.price || 0).toFixed(2),
        image_url: formattedImage || null,
      });
      return acc;
    }, {});

    const enriched = orders.map(order => ({
      ...order,
      items: itemsByOrder[order.id] || [],
    }));

    res.status(200).json(enriched);

  } catch (err) {
    console.error('[MyOrders] Error:', err.message);
    res.status(500).json({ message: 'Internal server error' });
  }
});

module.exports = router;
