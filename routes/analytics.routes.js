const express = require('express');
const router  = express.Router();
const pool    = require('../db');
const auth    = require('../middleware/auth');
const admin   = require('../middleware/admin');
const dayjs   = require('dayjs');

/* ----------------------------------------------------------------------
   GET /api/analytics/summary?from=YYYY-MM-DD&to=YYYY-MM-DD
   Returns: { orders, revenue, cancelled, avgMins, topItems:[] }
------------------------------------------------------------------------- */
router.get('/summary', auth, admin, async (req, res, next) => {
  try {
    /* 1️⃣ Date range --------------------------------------------------- */
    let { from, to } = req.query;
    if (!from || !to) {            // default → last 30 days
      to   = dayjs().format('YYYY-MM-DD');
      from = dayjs().subtract(30, 'day').format('YYYY-MM-DD');
    }
    const params = [from, to];

    /* 2️⃣ Headline numbers -------------------------------------------- */
    const [[head = {}]] = await pool.query(
      `SELECT COUNT(*)                       AS orders,
              IFNULL(SUM(total),0)           AS revenue,
              SUM(status = 'Cancelled')      AS cancelled
         FROM orders
        WHERE DATE(created_at) BETWEEN ? AND ?`,
      params
    );

    /* 3️⃣ Average delivery minutes ------------------------------------ */
    let avgMins = 0;
    try {
      const [[avg = {}]] = await pool.query(
        `SELECT ROUND(AVG(TIMESTAMPDIFF(MINUTE, created_at, delivered_at))) AS avgMins
           FROM orders
          WHERE status = 'Delivered'
            AND delivered_at IS NOT NULL
            AND DATE(created_at) BETWEEN ? AND ?`,
        params
      );
      avgMins = avg.avgMins || 0;
    } catch (e) {
      console.error('avgMins query failed →', e.message);
    }

    /* 4️⃣ Top 5 items -------------------------------------------------- */
    const [items] = await pool.query(
      `SELECT oi.name, SUM(COALESCE(oi.qty,1)) AS qty
         FROM order_items oi
         JOIN orders o ON o.id = oi.order_id
        WHERE DATE(o.created_at) BETWEEN ? AND ?
        GROUP BY oi.name
        ORDER BY qty DESC
        LIMIT 5`,
      params
    );

    /* 5️⃣ Response ----------------------------------------------------- */
    res.json({
      orders:    head.orders    || 0,
      revenue:   head.revenue   || 0,
      cancelled: head.cancelled || 0,
      avgMins,
      topItems:  items || [],
    });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
