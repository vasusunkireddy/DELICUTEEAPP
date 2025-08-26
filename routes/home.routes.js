const express = require('express');
const router = express.Router();
const pool = require('../db'); // your MySQL connection pool

/**
 * GET /api/adminhome/stats
 * Returns key metrics for the admin dashboard
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
      `SELECT COUNT(*) AS totalOrders, COALESCE(SUM(total), 0) AS totalRevenue
       FROM orders`
    );

    // Average Order Value (avoid division by zero)
    const avgOrderValue =
      analyticsData[0].totalOrders > 0
        ? Math.round(analyticsData[0].totalRevenue / analyticsData[0].totalOrders)
        : 0;

    // Last 7 days trend
    const [last7Days] = await pool.query(
      `SELECT DATE(created_at) AS day, COUNT(*) AS orders
       FROM orders
       WHERE created_at >= DATE_SUB(CURDATE(), INTERVAL 6 DAY)
       GROUP BY DATE(created_at)
       ORDER BY DATE(created_at) ASC`
    );

    // Fill in missing days with 0 orders
    const daysMap = {};
    last7Days.forEach((row) => {
      const dayStr = row.day.toISOString().split('T')[0];
      daysMap[dayStr] = row.orders;
    });

    const last7DaysFormatted = [];
    for (let i = 6; i >= 0; i--) {
      const date = new Date();
      date.setDate(date.getDate() - i);
      const dayStr = date.toISOString().split('T')[0];
      last7DaysFormatted.push({
        day: dayStr,
        orders: daysMap[dayStr] || 0,
      });
    }

    res.json({
      ordersToday: ordersTodayData[0].ordersToday || 0,
      pendingOrders: pendingOrdersData[0].pendingOrders || 0,
      totalOrders: analyticsData[0].totalOrders || 0,
      totalRevenue: analyticsData[0].totalRevenue || 0,
      avgOrderValue,
      last7Days: last7DaysFormatted,
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
