const express = require("express");
const router = express.Router();
const pool = require("../db");

// ─────────────────── Add to Waitlist ───────────────────
router.post("/", async (req, res) => {
  try {
    const { latitude, longitude, phone, email } = req.body;

    if (!latitude || !longitude) {
      return res.status(400).json({ msg: "Missing location" });
    }

    await pool.query(
      `INSERT INTO waitlist (latitude, longitude, phone, email) VALUES (?, ?, ?, ?)`,
      [latitude, longitude, phone || null, email || null]
    );

    res.json({ msg: "You’ll be notified when we deliver here 🚀" });
  } catch (err) {
    console.error("Error saving waitlist:", err.message);
    res.status(500).json({ msg: "Server error" });
  }
});

// ─────────────────── View Waitlist (Admin use) ───────────────────
router.get("/", async (req, res) => {
  try {
    const [rows] = await pool.query(`SELECT * FROM waitlist ORDER BY created_at DESC`);
    res.json(rows);
  } catch (err) {
    console.error("Error fetching waitlist:", err.message);
    res.status(500).json({ msg: "Server error" });
  }
});

module.exports = router;
