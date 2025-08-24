const express = require('express');
const router = express.Router();
const pool = require('../db'); // your MySQL connection pool

/**
 * GET /api/adminhome/stats
 * Returns the key metrics for the admin dashboard
 */
router.get('/stats', async (req, res) => {
  try {
    // Orders Today
    const [ordersTodayData] = await pool.query(
      `SELECT COUNT(*) AS ordersToday
       FROM orders
       WHERE DATE(created_at) = CURDATE()`
    );

    // Pending Orders
    const [pendingOrdersData] = await pool.query(
      `SELECT COUNT(*) AS pendingOrders
       FROM orders
       WHERE status = 'pending'`
    );

    // Analytics: total orders & revenue
    const [analyticsData] = await pool.query(
      `SELECT COUNT(*) AS totalOrders, SUM(total) AS totalRevenue
       FROM orders`
    );

    // Average Order Value
    const avgOrderValue =
      analyticsData[0].totalRevenue / (analyticsData[0].totalOrders || 1);

    // Last 7 days trend
    const [last7Days] = await pool.query(
      `SELECT DATE(created_at) AS day, COUNT(*) AS orders
       FROM orders
       WHERE created_at >= DATE_SUB(CURDATE(), INTERVAL 7 DAY)
       GROUP BY DATE(created_at)
       ORDER BY DATE(created_at) ASC`
    );

    res.json({
      ordersToday: ordersTodayData[0].ordersToday || 0,
      pendingOrders: pendingOrdersData[0].pendingOrders || 0,
      totalOrders: analyticsData[0].totalOrders || 0,
      totalRevenue: analyticsData[0].totalRevenue || 0,
      avgOrderValue: Math.round(avgOrderValue),
      last7Days: last7Days.map((row) => ({
        day: row.day.toISOString().split('T')[0],
        orders: row.orders,
      })),
    });
  } catch (err) {
    console.error('Admin Home Stats Error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

/**
 * GET /api/adminhome/latest-orders
 * Returns the 10 latest orders for dashboard table
 */
router.get('/latest-orders', async (req, res) => {
  try {
    const [latestOrders] = await pool.query(
      `SELECT id, customer_name, total, status, DATE_FORMAT(created_at, '%Y-%m-%d %H:%i') AS created_at
       FROM orders
       ORDER BY created_at DESC
       LIMIT 10`
    );

    res.json(latestOrders);
  } catch (err) {
    console.error('Latest Orders Error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

module.exports = router;
