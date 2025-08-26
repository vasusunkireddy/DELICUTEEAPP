const express = require('express');
const router = express.Router();
const pool = require('../db'); // Your MySQL connection pool
const jwt = require('jsonwebtoken'); // For JWT authentication
const { Server } = require('socket.io');

// Initialize Socket.IO (assuming this is integrated in your main server file)
let io; // Will be set from the main server file
function setIo(socketIo) {
  io = socketIo;
}

// Middleware to verify JWT token
const authenticateToken = (req, res, next) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1]; // Bearer <token>
  if (!token) {
    return res.status(401).json({ error: 'Unauthorized: No token provided' });
  }

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET || 'your_jwt_secret');
    req.user = decoded; // Attach user info to request
    next();
  } catch (err) {
    console.error('JWT Verification Error:', err.message);
    return res.status(403).json({ error: 'Unauthorized: Invalid token' });
  }
};

/**
 * GET /api/adminhome/stats
 * Returns key metrics for the admin dashboard
 */
router.get('/stats', authenticateToken, async (req, res) => {
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
router.get('/latest-orders', authenticateToken, async (req, res) => {
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

/**
 * GET /api/adminhome/latest-messages
 * Returns the 5 latest customer messages for dashboard
 */
router.get('/latest-messages', authenticateToken, async (req, res) => {
  try {
    const [latestMessages] = await pool.query(
      `SELECT m.user_id AS userId, u.name AS user, m.message AS text, 
              TIMESTAMPDIFF(MINUTE, m.created_at, NOW()) AS minutes_ago,
              DATE_FORMAT(m.created_at, '%Y-%m-%d %H:%i') AS time
       FROM messages m
       JOIN users u ON m.user_id = u.id
       WHERE m.sender_type = 'customer'
       ORDER BY m.created_at DESC
       LIMIT 5`
    );

    // Format time as "X mins ago" or exact timestamp
    const formattedMessages = latestMessages.map((msg) => ({
      userId: msg.userId,
      user: msg.user,
      text: msg.text,
      time: msg.minutes_ago < 60 ? `${msg.minutes_ago} mins ago` : msg.time,
    }));

    res.json(formattedMessages);
  } catch (err) {
    console.error('Latest Messages Error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

/**
 * POST /api/adminhome/send-message
 * Handles new customer messages (for testing or customer-side simulation)
 */
router.post('/send-message', authenticateToken, async (req, res) => {
  const { userId, text } = req.body;

  if (!userId || !text) {
    return res.status(400).json({ error: 'userId and text are required' });
  }

  try {
    const [result] = await pool.query(
      `INSERT INTO messages (user_id, message, sender_type, created_at)
       VALUES (?, ?, 'customer', NOW())`,
      [userId, text]
    );

    const [newMessage] = await pool.query(
      `SELECT m.user_id AS userId, u.name AS user, m.message AS text,
              TIMESTAMPDIFF(MINUTE, m.created_at, NOW()) AS minutes_ago,
              DATE_FORMAT(m.created_at, '%Y-%m-%d %H:%i') AS time
       FROM messages m
       JOIN users u ON m.user_id = u.id
       WHERE m.id = ?`,
      [result.insertId]
    );

    const formattedMessage = {
      userId: newMessage[0].userId,
      user: newMessage[0].user,
      text: newMessage[0].text,
      time: newMessage[0].minutes_ago < 60 ? `${newMessage[0].minutes_ago} mins ago` : newMessage[0].time,
    };

    // Emit new message to all connected admin clients
    io.emit('newMessage', formattedMessage);

    res.json({ message: 'Message sent successfully', data: formattedMessage });
  } catch (err) {
    console.error('Send Message Error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

module.exports = { router, setIo };