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
  buy_quantity: r.buy_quantity != null ? Number(r.buy_quantity) : null,
  category: r.category || null,
  menu_items: r.menu_items ? JSON.parse(r.menu_items) : [],
  start_date: r.start_date,
  end_date: r.end_date,
});

// GET all available coupons
router.get("/", verifyToken, async (req, res, next) => {
  try {
    const { category } = req.query; // Optional category filter
    const today = new Date().toISOString().slice(0, 10); // YYYY-MM-DD
    let query = `
      SELECT id, code, description, type, discount, discount_amount, buy_quantity, category, menu_items, start_date, end_date
      FROM coupons
      WHERE (start_date IS NULL OR start_date <= ?)
        AND (end_date IS NULL OR end_date >= ?)
    `;
    const params = [today, today];

    if (category) {
      query += ` AND category = ?`;
      params.push(category);
    }

    query += ` ORDER BY id DESC`;

    const [rows] = await pool.query(query, params);
    res.json(rows.map(mapRow));
  } catch (err) {
    console.error("Available coupons error:", err);
    next(err);
  }
});

// POST validate coupon
router.post("/validate", verifyToken, async (req, res, next) => {
  try {
    const { code, category, items } = req.body; // items for BUY_X validation
    if (!code) return res.status(400).json({ valid: false, message: "Code is required" });

    const [[row]] = await pool.query(
      `SELECT id, code, description, type, discount, discount_amount, buy_quantity, category, menu_items, start_date, end_date
       FROM coupons
       WHERE UPPER(code) = ?`,
      [code.trim().toUpperCase()]
    );

    if (!row) {
      return res.json({ valid: false, message: "Coupon not found" });
    }

    const coupon = mapRow(row);
    const today = new Date();

    // Validate date range
    if (coupon.start_date && today < new Date(coupon.start_date))
      return res.json({ valid: false, message: "Coupon not started yet" });
    if (coupon.end_date && today > new Date(coupon.end_date))
      return res.json({ valid: false, message: "Coupon expired" });

    // Type-specific validation
    if (coupon.type === "FIRST_ORDER") {
      // Check if user already has orders
      const [[{ cnt }]] = await pool.query(
        "SELECT COUNT(*) AS cnt FROM orders WHERE user_id = ?",
        [req.user.id]
      );
      if (cnt > 0) {
        return res.json({ valid: false, message: "Coupon valid only on your first order" });
      }
      return res.json({ valid: true, discount: coupon.discount, ...coupon });
    } else if (coupon.type === "BUY_X") {
      if (!category || category !== coupon.category) {
        return res.json({ valid: false, message: "Invalid or missing category" });
      }
      if (!items || items.length < coupon.buy_quantity) {
        return res.json({ valid: false, message: `Must include at least ${coupon.buy_quantity} items from ${coupon.category}` });
      }
      if (coupon.menu_items.length > 0) {
        // For categories like Pizza with specific menu items
        const invalidItems = items.filter(item => !coupon.menu_items.includes(item));
        if (invalidItems.length > 0) {
          return res.json({ valid: false, message: "Invalid menu items selected" });
        }
      }
      return res.json({ valid: true, discount_amount: coupon.discount_amount, buy_quantity: coupon.buy_quantity, ...coupon });
    }

    return res.json({ valid: false, message: "Unknown coupon type" });
  } catch (err) {
    console.error("Coupon validation error:", err);
    next(err);
  }
});

// POST create coupon
router.post("/", verifyToken, async (req, res, next) => {
  try {
    const { code, description, type, discount, discount_amount, buy_quantity, category, menu_items, start_date, end_date } = req.body;

    if (!code) return res.status(400).json({ message: "Code is required" });
    if (type === "FIRST_ORDER" && !discount) return res.status(400).json({ message: "Discount required for FIRST_ORDER" });
    if (type === "BUY_X" && (!category || !buy_quantity || !discount_amount)) {
      return res.status(400).json({ message: "Category, buy quantity, and discount amount required for BUY_X" });
    }

    const [result] = await pool.query(
      `INSERT INTO coupons (code, description, type, discount, discount_amount, buy_quantity, category, menu_items, start_date, end_date)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        code.trim(),
        description || null,
        type,
        discount || null,
        discount_amount || null,
        buy_quantity || null,
        category || null,
        menu_items ? JSON.stringify(menu_items) : null,
        start_date || null,
        end_date || null,
      ]
    );

    const [[newCoupon]] = await pool.query("SELECT * FROM coupons WHERE id = ?", [result.insertId]);
    res.status(201).json(mapRow(newCoupon));
  } catch (err) {
    console.error("Create coupon error:", err);
    next(err);
  }
});

// PUT update coupon
router.put("/:id", verifyToken, async (req, res, next) => {
  try {
    const { id } = req.params;
    const { code, description, type, discount, discount_amount, buy_quantity, category, menu_items, start_date, end_date } = req.body;

    if (!code) return res.status(400).json({ message: "Code is required" });
    if (type === "FIRST_ORDER" && !discount) return res.status(400).json({ message: "Discount required for FIRST_ORDER" });
    if (type === "BUY_X" && (!category || !buy_quantity || !discount_amount)) {
      return res.status(400).json({ message: "Category, buy quantity, and discount amount required for BUY_X" });
    }

    await pool.query(
      `UPDATE coupons
       SET code = ?, description = ?, type = ?, discount = ?, discount_amount = ?, buy_quantity = ?, category = ?, menu_items = ?, start_date = ?, end_date = ?
       WHERE id = ?`,
      [
        code.trim(),
        description || null,
        type,
        discount || null,
        discount_amount || null,
        buy_quantity || null,
        category || null,
        menu_items ? JSON.stringify(menu_items) : null,
        start_date || null,
        end_date || null,
        id,
      ]
    );

    const [[updatedCoupon]] = await pool.query("SELECT * FROM coupons WHERE id = ?", [id]);
    if (!updatedCoupon) return res.status(404).json({ message: "Coupon not found" });
    res.json(mapRow(updatedCoupon));
  } catch (err) {
    console.error("Update coupon error:", err);
    next(err);
  }
});

// DELETE coupon
router.delete("/:id", verifyToken, async (req, res, next) => {
  try {
    const { id } = req.params;
    const [result] = await pool.query("DELETE FROM coupons WHERE id = ?", [id]);
    if (result.affectedRows === 0) return res.status(404).json({ message: "Coupon not found" });
    res.json({ message: "Coupon deleted" });
  } catch (err) {
    console.error("Delete coupon error:", err);
    next(err);
  }
});

module.exports = router;