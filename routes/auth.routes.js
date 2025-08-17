const express = require("express");
const jwt = require("jsonwebtoken");
const pool = require("../db");
const sendOtpEmail = require("../utils/mailer"); // OTP mailer
const router = express.Router();

const JWT_SECRET = process.env.JWT_SECRET || "your_jwt_secret";

// ───────────── Helper: Generate Token ─────────────
function generateToken(user) {
  return jwt.sign(
    {
      id: user.id,
      email: user.email,
      role: user.role,
    },
    JWT_SECRET,
    { expiresIn: "7d" }
  );
}

// ───────────── 1. Send OTP ─────────────
router.post("/send-otp", async (req, res) => {
  const { email } = req.body;
  if (!email) return res.status(400).json({ message: "Email is required" });

  try {
    // Always generate 6-digit OTP (string, preserving leading 0s)
    const otp = String(Math.floor(100000 + Math.random() * 900000)).padStart(6, "0");
    const expiry = new Date(Date.now() + 10 * 60 * 1000); // 10 min

    let [rows] = await pool.query("SELECT * FROM users WHERE email=?", [email]);

    if (rows.length) {
      await pool.query("UPDATE users SET otp_code=?, otp_expiry=? WHERE email=?", [
        otp,
        expiry,
        email,
      ]);
    } else {
      await pool.query(
        "INSERT INTO users (email, otp_code, otp_expiry, role) VALUES (?, ?, ?, 'customer')",
        [email, otp, expiry]
      );
    }

    await sendOtpEmail(email, otp);
    res.json({ message: "OTP sent successfully" });
  } catch (err) {
    console.error("❌ Send OTP Error:", err);
    res.status(500).json({ message: "Server error" });
  }
});

// ───────────── 2. Verify OTP ─────────────
router.post("/verify-otp", async (req, res) => {
  const { email, otp } = req.body;
  if (!email || !otp) return res.status(400).json({ message: "Missing email or OTP" });

  try {
    const [rows] = await pool.query("SELECT * FROM users WHERE email=?", [email]);
    if (!rows.length) return res.status(404).json({ message: "User not found" });

    const user = rows[0];
    console.log("🔍 DB OTP:", user.otp_code, "User input:", otp);

    // Compare as string (fix for leading zeros)
    if (String(user.otp_code).padStart(6, "0") !== String(otp).padStart(6, "0")) {
      return res.status(400).json({ message: "Invalid OTP" });
    }

    // Expiry check
    const expiry = new Date(user.otp_expiry);
    if (!expiry || expiry.getTime() < Date.now()) {
      return res.status(400).json({ message: "OTP expired" });
    }

    const token = generateToken(user);

    // Clear OTP after success
    await pool.query("UPDATE users SET otp_code=NULL, otp_expiry=NULL WHERE id=?", [user.id]);

    res.json({
      message: "OTP verified",
      token,
      user: {
        id: user.id,
        role: user.role,
        fullName: user.full_name,
        email: user.email,
        phone: user.phone,
      },
    });
  } catch (err) {
    console.error("❌ Verify OTP Error:", err);
    res.status(500).json({ message: "Server error" });
  }
});

// ───────────── 3. Save Phone After OTP ─────────────
router.post("/save-phone", async (req, res) => {
  const { email, phone, fullName } = req.body;
  if (!email || !phone) return res.status(400).json({ message: "Missing email or phone" });

  try {
    await pool.query("UPDATE users SET phone=?, full_name=? WHERE email=?", [
      phone,
      fullName || null,
      email,
    ]);

    const [rows] = await pool.query("SELECT * FROM users WHERE email=?", [email]);
    if (!rows.length) return res.status(404).json({ message: "User not found" });

    const user = rows[0];
    const token = generateToken(user);

    res.json({
      message: "Phone number saved",
      token,
      user: {
        id: user.id,
        role: user.role,
        fullName: user.full_name,
        email: user.email,
        phone: user.phone,
      },
    });
  } catch (err) {
    console.error("❌ Save Phone Error:", err);
    res.status(500).json({ message: "Server error" });
  }
});

// ───────────── 4. Google Login ─────────────
router.post("/google-login", async (req, res) => {
  const { email, fullName } = req.body;
  if (!email) return res.status(400).json({ message: "Missing email" });

  try {
    let [rows] = await pool.query("SELECT * FROM users WHERE email=?", [email]);

    if (!rows.length) {
      await pool.query(
        "INSERT INTO users (email, full_name, role) VALUES (?, ?, 'customer')",
        [email, fullName || null]
      );
      [rows] = await pool.query("SELECT * FROM users WHERE email=?", [email]);
    }

    const user = rows[0];
    const token = generateToken(user);

    res.json({
      message: "Login successful",
      token,
      user: {
        id: user.id,
        role: user.role,
        fullName: user.full_name,
        email: user.email,
        phone: user.phone,
      },
    });
  } catch (err) {
    console.error("❌ Google Login Error:", err);
    res.status(500).json({ message: "Server error" });
  }
});

module.exports = router;
