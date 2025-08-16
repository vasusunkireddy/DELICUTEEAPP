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
  min_qty: r.min_qty ? Number(r.min_qty) : null,
  category_id: r.category_id ? Number(r.category_id) : null,
  start_date: r.start_date,
  end_date: r.end_date,
  buy_qty: r.buy_qty ? Number(r.buy_qty) : null,
  free_qty: r.free_qty ? Number(r.free_qty) : null,
  product: r.product || null,
});

// GET all available coupons
router.get("/", verifyToken, async (_req, res, next) => {
  try {
    const today = new Date().toISOString().slice(0, 10); // YYYY-MM-DD
    const [rows] = await pool.query(
      `SELECT id, code, description, type, discount, min_qty, category_id, start_date, end_date, buy_qty, free_qty, product
       FROM coupons
       WHERE (start_date IS NULL OR start_date <= ?)
         AND (end_date IS NULL OR end_date >= ?)
       ORDER BY id DESC`,
      [today, today]
    );
    console.log("Available coupons:", rows.map(mapRow));
    res.json(rows.map(mapRow));
  } catch (err) {
    console.error("Available coupons error:", err);
    next(err);
  }
});

// POST validate coupon
router.post("/validate", verifyToken, async (req, res, next) => {
  try {
    const { code, cartItems = [] } = req.body;
    console.log("Validate request:", { code, cartItems, user_id: req.user.id });
    if (!code) return res.status(400).json({ valid: false, message: "Code is required" });

    const [[row]] = await pool.query(
      `SELECT id, code, description, type, discount, min_qty, category_id, start_date, end_date, buy_qty, free_qty, product
       FROM coupons WHERE UPPER(code) = ?`,
      [code.trim().toUpperCase()]
    );
    if (!row) {
      console.log(`Coupon not found: ${code}`);
      return res.json({ valid: false, message: "Coupon not found" });
    }

    const c = mapRow(row);
    console.log("Coupon data:", c);

    const today = new Date();
    if (c.start_date && today < new Date(c.start_date))
      return res.json({ valid: false, message: "Coupon not started yet" });
    if (c.end_date && today > new Date(c.end_date))
      return res.json({ valid: false, message: "Coupon expired" });

    // Load user cart from DB if not provided
    let items = cartItems;
    if (!items.length) {
      const [rows] = await pool.query(
        `SELECT mi.category_id, ci.quantity, mi.price
         FROM cart_items ci
         JOIN menu_items mi ON mi.id = ci.menu_item_id
         WHERE ci.user_id = ?`,
        [req.user.id]
      );
      items = rows.map((r) => ({
        category_id: r.category_id ? Number(r.category_id) : null,
        qty: Number(r.quantity),
        price: Number(r.price),
      }));
    }
    console.log("Cart items:", items);

    const totalQty = items.reduce((sum, i) => sum + (i.qty || 0), 0);
    const categoryQty = {};
    items.forEach((i) => {
      const cat = i.category_id ? Number(i.category_id) : null;
      if (cat) categoryQty[cat] = (categoryQty[cat] || 0) + (i.qty || 0);
    });
    console.log("Category quantities:", categoryQty);

    let discount = 0;

    // Validation by type
    switch (c.type) {
      case "BUY_X":
        if (c.category_id) {
          const catQty = categoryQty[c.category_id] || 0;
          if (catQty < c.min_qty) {
            return res.json({ valid: false, message: `Add at least ${c.min_qty} item(s) in category ID ${c.category_id}` });
          }
        } else if (totalQty < c.min_qty) {
          return res.json({ valid: false, message: `Add at least ${c.min_qty} item(s) to use this coupon` });
        }
        discount = c.discount;
        break;

      case "FIRST_ORDER": {
        const [[{ cnt }]] = await pool.query(
          "SELECT COUNT(*) AS cnt FROM orders WHERE user_id = ?",
          [req.user.id]
        );
        if (cnt > 0) {
          return res.json({ valid: false, message: "Coupon valid only on your first order" });
        }
        discount = c.discount;
        break;
      }

      case "BUY_X_GET_Y":
        if (!c.buy_qty || !c.free_qty) {
          return res.json({ valid: false, message: "Invalid offer configuration" });
        }
        let eligibleItems = items;
        if (c.category_id) {
          eligibleItems = items.filter((i) => i.category_id === c.category_id);
        }
        const qtyInCat = eligibleItems.reduce((sum, i) => sum + (i.qty || 0), 0);
        if (qtyInCat < c.buy_qty) {
          return res.json({
            valid: false,
            message: `Add at least ${c.buy_qty} item(s) in category ID ${c.category_id || "cart"}`,
          });
        }
        const cheapestPrice = eligibleItems.length
          ? Math.min(...eligibleItems.map((i) => i.price || 0))
          : 0;
        const offerGroups = Math.floor(qtyInCat / (c.buy_qty + c.free_qty));
        discount = offerGroups * (c.free_qty * cheapestPrice);
        break;

      case "PERCENT":
        discount = (c.discount / 100) * items.reduce((sum, i) => sum + (i.price || 0) * (i.qty || 0), 0);
        break;

      case "DATE_RANGE":
        discount = c.discount;
        break;

      default:
        return res.json({ valid: false, message: "Unknown coupon type" });
    }

    res.json({ valid: true, discount: parseFloat(discount.toFixed(2)), ...c });
  } catch (err) {
    console.error("Coupon validation error:", err);
    next(err);
  }
});

module.exports = router;