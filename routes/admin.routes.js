const express = require("express");
const router = express.Router();
const pool = require("../db"); // your MySQL pool
const authenticate = require("../middleware/authenticate");

// Dashboard stats
router.get("/stats", authenticate, async (req, res) => {
  try {
    const [[ordersToday]] = await pool.query(
      "SELECT COUNT(*) as total FROM orders WHERE DATE(created_at) = CURDATE()"
    );
    const [[revenueToday]] = await pool.query(
      "SELECT COALESCE(SUM(total),0) as revenue FROM orders WHERE DATE(created_at) = CURDATE()"
    );
    const [[pending]] = await pool.query(
      "SELECT COUNT(*) as total FROM orders WHERE status='pending'"
    );
    const [[lowStock]] = await pool.query(
      "SELECT COUNT(*) as total FROM menu WHERE stock < 5"
    );

    res.json({
      ordersToday: ordersToday.total,
      revenueToday: revenueToday.revenue,
      pendingOrders: pending.total,
      lowStock: lowStock.total,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Something went wrong" });
  }
});

// Latest 5 orders
router.get("/latest-orders", authenticate, async (req, res) => {
  try {
    const [rows] = await pool.query(
      `SELECT id, customer_name, total, status 
       FROM orders 
       ORDER BY created_at DESC 
       LIMIT 5`
    );
    res.json(rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Something went wrong" });
  }
});

// Weekly orders chart
router.get("/weekly-orders", authenticate, async (req, res) => {
  try {
    const [rows] = await pool.query(`
      SELECT DAYNAME(created_at) as day, COUNT(*) as total
      FROM orders
      WHERE created_at >= DATE_SUB(CURDATE(), INTERVAL 7 DAY)
      GROUP BY DAYNAME(created_at)
      ORDER BY created_at ASC
    `);
    res.json(rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Something went wrong" });
  }
});

module.exports = router;
