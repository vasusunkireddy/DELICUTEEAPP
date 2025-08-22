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
  type: r.type,
  discount: r.discount != null ? Number(r.discount) : null,
  discount_amount: r.discount_amount != null ? Number(r.discount_amount) : null,
  buy_quantity: r.buy_quantity || null,
  category: r.category || null,
  menu_items: r.menu_items ? JSON.parse(r.menu_items) : [],
  start_date: r.start_date,
  end_date: r.end_date,
});

// GET all active coupons
router.get("/", verifyToken, async (_req, res, next) => {
  try {
    const today = new Date().toISOString().slice(0, 10); // YYYY-MM-DD
    const [rows] = await pool.query(
      `SELECT *
       FROM coupons
       WHERE (start_date IS NULL OR start_date <= ?)
         AND (end_date IS NULL OR end_date >= ?)
       ORDER BY id DESC`,
      [today, today]
    );
    res.json(rows.map(mapRow));
  } catch (err) {
    console.error("Load coupons error:", err);
    next(err);
  }
});

// Validate coupon
router.post("/validate", verifyToken, async (req, res, next) => {
  try {
    const { code, items } = req.body; // items = array of cart items [{id, quantity, category}]
    if (!code) return res.status(400).json({ valid: false, message: "Code is required" });

    const [[row]] = await pool.query(
      `SELECT * FROM coupons WHERE UPPER(code) = ?`,
      [code.trim().toUpperCase()]
    );

    if (!row) return res.json({ valid: false, message: "Coupon not found" });

    const c = mapRow(row);
    const today = new Date();

    if (c.start_date && today < new Date(c.start_date)) return res.json({ valid: false, message: "Coupon not started yet" });
    if (c.end_date && today > new Date(c.end_date)) return res.json({ valid: false, message: "Coupon expired" });

    if (c.type === "FIRST_ORDER") {
      // Check if user already has orders
      const [[{ cnt }]] = await pool.query(
        "SELECT COUNT(*) AS cnt FROM orders WHERE user_id = ?",
        [req.user.id]
      );
      if (cnt > 0) return res.json({ valid: false, message: "Valid only on first order" });
    }

    if (c.type === "BUY_X") {
      if (!items || !Array.isArray(items) || items.length === 0)
        return res.status(400).json({ valid: false, message: "Cart items required for BUY_X coupon" });

      // Count matching items
      let matchCount = 0;
      items.forEach(item => {
        const inCategory = c.category ? item.category === c.category : true;
        const inMenu = c.menu_items.length > 0 ? c.menu_items.includes(item.id) : true;
        if (inCategory && inMenu) matchCount += item.quantity;
      });

      if (matchCount < c.buy_quantity) {
        return res.json({
          valid: false,
          message: `Add at least ${c.buy_quantity} eligible item(s) to use this coupon`,
        });
      }
    }

    res.json({ valid: true, ...c });
  } catch (err) {
    console.error("Coupon validation error:", err);
    next(err);
  }
});

module.exports = router;
