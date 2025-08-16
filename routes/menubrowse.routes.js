// routes/menubrowse.routes.js
const express = require("express");
const pool = require("../db");

const router = express.Router();

/* ✅ GET all items (public browse) */
router.get("/", async (_req, res) => {
  try {
    const [rows] = await pool.query(`
      SELECT
        m.id,
        m.name,
        m.description,
        m.price,
        m.image_url,
        m.category_id,
        c.name AS category_name,
        ROUND(AVG(oi.rating), 1) AS rating_avg,
        COUNT(oi.rating) AS rating_count
      FROM menu_items m
      LEFT JOIN order_items oi
        ON oi.product_id = m.id AND oi.rating IS NOT NULL
      LEFT JOIN categories c
        ON c.id = m.category_id
      WHERE m.available = 1
      GROUP BY m.id, c.name
      ORDER BY m.id DESC
    `);

    res.json(rows.map(row => ({
      ...row,
      price: Number(row.price),
      category_id: row.category_id || null,
      category_name: row.category_name || "Uncategorized",
      rating_avg: row.rating_avg || 0,
      rating_count: row.rating_count || 0,
    })));
  } catch (err) {
    console.error("Error fetching menu browse:", err);
    res.status(500).json({ error: "Failed to fetch menu items" });
  }
});

/* ✅ GET grouped by category */
router.get("/grouped", async (_req, res) => {
  try {
    const [categories] = await pool.query(`
      SELECT id, name, description, image AS image_url
      FROM categories
      ORDER BY name ASC
    `);

    const [items] = await pool.query(`
      SELECT
        m.id,
        m.name,
        m.description,
        m.price,
        m.image_url,
        m.category_id,
        c.name AS category_name,
        ROUND(AVG(oi.rating), 1) AS rating_avg,
        COUNT(oi.rating) AS rating_count
      FROM menu_items m
      LEFT JOIN order_items oi
        ON oi.product_id = m.id AND oi.rating IS NOT NULL
      LEFT JOIN categories c
        ON c.id = m.category_id
      WHERE m.available = 1
      GROUP BY m.id, c.name
      ORDER BY m.id ASC
    `);

    const grouped = categories.map(cat => ({
      id: cat.id,
      name: cat.name,
      description: cat.description || null,
      image_url: cat.image_url || null,
      items: items
        .filter(i => Number(i.category_id) === Number(cat.id))
        .map(i => ({
          id: i.id,
          name: i.name,
          description: i.description || null,
          price: Number(i.price),
          image_url: i.image_url || null,
          category_id: i.category_id || null,
          category_name: i.category_name || "Uncategorized",
          rating_avg: i.rating_avg || 0,
          rating_count: i.rating_count || 0,
        })),
    }));

    res.json(grouped);
  } catch (err) {
    console.error("Error fetching grouped menu browse:", err);
    res.status(500).json({ error: "Failed to fetch grouped menu" });
  }
});

/* ✅ GET single item */
router.get("/:id", async (req, res) => {
  try {
    const [[item]] = await pool.query(`
      SELECT
        m.id,
        m.name,
        m.description,
        m.price,
        m.image_url,
        m.category_id,
        c.name AS category_name,
        ROUND(AVG(oi.rating), 1) AS rating_avg,
        COUNT(oi.rating) AS rating_count
      FROM menu_items m
      LEFT JOIN order_items oi
        ON oi.product_id = m.id AND oi.rating IS NOT NULL
      LEFT JOIN categories c
        ON c.id = m.category_id
      WHERE m.id = ? AND m.available = 1
      GROUP BY m.id, c.name
    `, [req.params.id]);

    if (!item) return res.status(404).json({ error: "Item not found" });

    res.json({
      ...item,
      price: Number(item.price),
      category_id: item.category_id || null,
      category_name: item.category_name || "Uncategorized",
      rating_avg: item.rating_avg || 0,
      rating_count: item.rating_count || 0,
    });
  } catch (err) {
    console.error("Error fetching single menu browse item:", err);
    res.status(500).json({ error: "Failed to fetch item" });
  }
});

module.exports = router;
