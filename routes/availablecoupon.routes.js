const express = require("express");
const pool = require("../db");
const jwt = require("jsonwebtoken");

const router = express.Router();

// Middleware: Verify JWT token
const verifyToken = (req, res, next) => {
  const token = (req.headers.authorization || "").replace("Bearer ", "");
  if (!token) return res.status(401).json({ message: "Auth token missing" });
  try {
    req.user = jwt.verify(token, process.env.JWT_SECRET);
    next();
  } catch {
    res.status(401).json({ message: "Invalid or expired token" });
  }
};

// Format coupon row
const mapRow = (r) => ({
  id: r.id,
  code: r.code.trim(),
  description: r.description || "",
  type: "FIRST_ORDER",
  discount: r.discount != null ? Number(r.discount) : null,
  start_date: r.start_date,
  end_date: r.end_date,
});

// GET all available FIRST_ORDER coupons
router.get("/", verifyToken, async (_req, res, next) => {
  try {
    const today = new Date().toISOString().slice(0, 10); // YYYY-MM-DD
    const [rows] = await pool.query(
      `SELECT id, code, description, type, discount, start_date, end_date
       FROM coupons
       WHERE type = 'FIRST_ORDER'
         AND (start_date IS NULL OR start_date <= ?)
         AND (end_date IS NULL OR end_date >= ?)
       ORDER BY id DESC`,
      [today, today]
    );
    res.json(rows.map(mapRow));
  } catch (err) {
    console.error("Available coupons error:", err);
    next(err);
  }
});

// POST validate FIRST_ORDER coupon
router.post("/validate", verifyToken, async (req, res, next) => {
  try {
    const { code } = req.body;
    if (!code) return res.status(400).json({ valid: false, message: "Code is required" });

    const [[row]] = await pool.query(
      `SELECT id, code, description, type, discount, start_date, end_date
       FROM coupons
       WHERE type = 'FIRST_ORDER' AND UPPER(code) = ?`,
      [code.trim().toUpperCase()]
    );

    if (!row) {
      return res.json({ valid: false, message: "Coupon not found" });
    }

    const c = mapRow(row);
    const today = new Date();

    if (c.start_date && today < new Date(c.start_date))
      return res.json({ valid: false, message: "Coupon not started yet" });
    if (c.end_date && today > new Date(c.end_date))
      return res.json({ valid: false, message: "Coupon expired" });

    // Check if user already has orders
    const [[{ cnt }]] = await pool.query(
      "SELECT COUNT(*) AS cnt FROM orders WHERE user_id = ?",
      [req.user.id]
    );
    if (cnt > 0) {
      return res.json({ valid: false, message: "Coupon valid only on your first order" });
    }

    res.json({ valid: true, discount: c.discount, ...c });
  } catch (err) {
    console.error("Coupon validation error:", err);
    next(err);
  }
});

module.exports = router;
