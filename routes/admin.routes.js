const express = require('express');
const dayjs = require('dayjs');
const router = express.Router();
const pool = require('../db'); // MySQL connection pool
const auth = require('../middleware/auth');
const admin = require('../middleware/admin');

// GET /api/adminhome/stats
// Returns stats for AdminHomeScreen: ordersToday, pendingOrders, totalOrders, totalRevenue, avgOrderValue, last7Days
router.get('/stats', auth, admin, async (req, res, next) => {
  try {
    const connection = await pool.getConnection();

    // Get today's date in IST
    const today = dayjs();
    const todayStart = today.startOf('day').format('YYYY-MM-DD HH:mm:ss');
    const todayEnd = today.endOf('day').format('YYYY-MM-DD HH:mm:ss');

    // Orders today
    const [ordersTodayResult] = await connection.query(
      'SELECT COUNT(*) as count FROM orders WHERE created_at >= ? AND created_at < ?',
      [todayStart, todayEnd]
    );

    // Pending orders
    const [pendingOrdersResult] = await connection.query(
      'SELECT COUNT(*) as count FROM orders WHERE status = ?',
      ['Pending']
    );

    // Total orders
    const [totalOrdersResult] = await connection.query(
      'SELECT COUNT(*) as count FROM orders'
    );

    // Total revenue
    const [totalRevenueResult] = await connection.query(
      'SELECT SUM(total) as total FROM orders'
    );

    // Average order value
    const [avgOrderValueResult] = await connection.query(
      'SELECT AVG(total) as avg FROM orders'
    );

    // Last 7 days orders (fixed for ONLY_FULL_GROUP_BY)
    const sevenDaysAgo = today.subtract(7, 'day').startOf('day').format('YYYY-MM-DD HH:mm:ss');
    const [last7DaysResult] = await connection.query(
      `SELECT DATE_FORMAT(created_at, '%Y-%m-%d') as day, COUNT(*) as orders 
       FROM orders 
       WHERE created_at >= ? 
       GROUP BY DATE_FORMAT(created_at, '%Y-%m-%d')
       ORDER BY DATE_FORMAT(created_at, '%Y-%m-%d') DESC`,
      [sevenDaysAgo]
    );

    connection.release();

    res.json({
      ordersToday: ordersTodayResult[0].count || 0,
      pendingOrders: pendingOrdersResult[0].count || 0,
      totalOrders: totalOrdersResult[0].count || 0,
      totalRevenue: parseFloat(totalRevenueResult[0].total || 0).toFixed(2),
      avgOrderValue: parseFloat(avgOrderValueResult[0].avg || 0).toFixed(2),
      last7Days: last7DaysResult.map(row => ({
        day: row.day,
        orders: row.orders,
      })),
    });
  } catch (error) {
    console.error('Stats error:', error.message);
    next(error); // Use server's error handler
  }
});

// GET /api/adminhome/latest-orders
// Returns latest 10 orders with id, customer_name, total, status
router.get('/latest-orders', auth, admin, async (req, res, next) => {
  try {
    const connection = await pool.getConnection();

    // Fetch latest 10 orders, join with users to get customer name (use full_name instead of username)
    const [orders] = await connection.query(
      `SELECT o.id, COALESCE(o.customer_name, u.full_name, 'Unknown') as customer_name, o.total, o.status
       FROM orders o
       LEFT JOIN users u ON o.user_id = u.id
       ORDER BY o.created_at DESC
       LIMIT 10`
    );

    connection.release();

    res.json(orders.map(order => ({
      id: order.id.toString(), // Convert to string for frontend
      customer_name: order.customer_name,
      total: parseFloat(order.total).toFixed(2), // Format as string with 2 decimals
      status: order.status,
    })));
  } catch (error) {
    console.error('Latest orders error:', error.message);
    next(error); // Use server's error handler
  }
});

module.exports = router;