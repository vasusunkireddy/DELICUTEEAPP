const express = require("express");
const router = express.Router();
const pool = require("../db");
const { authenticate } = require("../middleware/auth"); // if you have auth

// Get or create conversation
router.post("/conversation", authenticate, async (req, res) => {
  const { userId } = req.user; // logged-in user
  const { otherUserId } = req.body;

  try {
    // Ensure consistent ordering
    const [existing] = await pool.query(
      `SELECT * FROM conversations WHERE 
       (user_a_id=? AND user_b_id=?) OR (user_a_id=? AND user_b_id=?)`,
      [userId, otherUserId, otherUserId, userId]
    );

    if (existing.length > 0) return res.json(existing[0]);

    const [result] = await pool.query(
      `INSERT INTO conversations (user_a_id, user_b_id) VALUES (?, ?)`,
      [userId, otherUserId]
    );
    res.json({ id: result.insertId, user_a_id: userId, user_b_id: otherUserId });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to create conversation" });
  }
});

// Get messages
router.get("/messages/:conversationId", authenticate, async (req, res) => {
  const { conversationId } = req.params;
  try {
    const [rows] = await pool.query(
      `SELECT * FROM messages WHERE conversation_id=? ORDER BY created_at ASC`,
      [conversationId]
    );
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: "Failed to fetch messages" });
  }
});

module.exports = router;
