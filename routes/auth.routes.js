// routes/auth.routes.js
const express = require("express");
const jwt = require("jsonwebtoken");
const router = express.Router();
const pool = require("../db"); // mysql2/promise pool

// ───────────── JWT ─────────────
const JWT_SECRET = process.env.JWT_SECRET || "your_jwt_secret";
function generateToken(user) {
  return jwt.sign(
    { id: user.id, email: user.email, role: user.role },
    JWT_SECRET,
    { expiresIn: "7d" }
  );
}

function verifyToken(req, res, next) {
  try {
    const hdr = req.headers.authorization || "";
    const token = hdr.startsWith("Bearer ") ? hdr.slice(7) : null;
    if (!token) return res.status(401).json({ message: "No token" });
    req.user = jwt.verify(token, JWT_SECRET);
    next();
  } catch {
    return res.status(401).json({ message: "Invalid token" });
  }
}

// ───────────── Mailer (safe fallback) ─────────────
let _sendOtpImpl = null;
try {
  const mod = require("../utils/mailer");
  _sendOtpImpl = typeof mod === "function" ? mod : (mod?.sendOtpEmail || mod?.default);
} catch {}
async function safeSendOtpEmail(to, otp) {
  if (typeof _sendOtpImpl === "function") return _sendOtpImpl(to, otp);
  console.warn(`[DEV] Mailer not configured. OTP for ${to}: ${otp}`);
  return true;
}

// ───────────── Helpers ─────────────
function sixDigitOTP() {
  return String(Math.floor(100000 + Math.random() * 900000)).padStart(6, "0");
}
function normalizeEmail(e) {
  return String(e || "").trim().toLowerCase();
}
async function getUserByEmail(email) {
  const [rows] = await pool.query("SELECT * FROM users WHERE email = ?", [email]);
  return rows?.[0] || null;
}
async function getUserById(id) {
  const [rows] = await pool.query("SELECT * FROM users WHERE id = ?", [id]);
  return rows?.[0] || null;
}
async function upsertOtp(email, otp, expiry) {
  const user = await getUserByEmail(email);
  if (user) {
    await pool.query(
      "UPDATE users SET otp_code = ?, otp_expiry = ? WHERE email = ?",
      [otp, expiry, email]
    );
    return user.id;
  }
  const [res] = await pool.query(
    "INSERT INTO users (email, role, otp_code, otp_expiry) VALUES (?, 'customer', ?, ?)",
    [email, otp, expiry]
  );
  return res.insertId;
}

/**
 * Strict Indian mobile validation:
 * - Exactly 10 digits
 * - Starts with 6/7/8/9
 * - Not all same digit (e.g., 0000000000, 1111111111)
 */
function isValidPhoneIN(p) {
  const s = String(p || "").trim();
  if (!/^\d{10}$/.test(s)) return false;
  if (!/^[6-9]\d{9}$/.test(s)) return false;
  if (/(.)\1{9}/.test(s)) return false; // all same digit
  return true;
}

/** Enforce: once a phone is set for a user, it cannot be changed (locked) */
async function assertPhoneNotLocked(userId, newPhone) {
  const user = await getUserById(userId);
  if (!user) return { ok: false, code: 404, msg: "User not found" };

  const existing = (user.phone || "").trim();
  if (existing && existing !== newPhone) {
    return { ok: false, code: 409, msg: "Phone already set and locked for this account" };
  }
  return { ok: true, user };
}

/** Enforce: phone must be globally unique across users */
async function assertPhoneAvailableForUser(userId, phone) {
  const [rows] = await pool.query(
    "SELECT id FROM users WHERE phone = ? AND id <> ? LIMIT 1",
    [phone, userId]
  );
  if (rows && rows.length) {
    return { ok: false, code: 409, msg: "Phone already in use by another account" };
  }
  return { ok: true };
}

// ───────────── 1) Send OTP ─────────────
router.post("/send-otp", async (req, res) => {
  try {
    const email = normalizeEmail(req.body?.email);
    if (!email || !/\S+@\S+\.\S+/.test(email)) {
      return res.status(400).json({ message: "Valid email required" });
    }

    const otp = sixDigitOTP();
    const expiry = new Date(Date.now() + 10 * 60 * 1000);
    await upsertOtp(email, otp, expiry);
    await safeSendOtpEmail(email, otp);

    return res.json(
      process.env.NODE_ENV === "production"
        ? { message: "OTP sent successfully" }
        : { message: "OTP sent (dev)", dev_otp: otp }
    );
  } catch (err) {
    console.error("❌ Send OTP Error:", err);
    return res.status(500).json({ message: "Server error" });
  }
});

// ───────────── 2) Verify OTP ─────────────
router.post("/verify-otp", async (req, res) => {
  try {
    const email = normalizeEmail(req.body?.email);
    const otpInput = String(req.body?.otp ?? "").padStart(6, "0");

    if (!email || !otpInput) {
      return res.status(400).json({ message: "Missing email or OTP" });
    }

    const user = await getUserByEmail(email);
    if (!user) return res.status(404).json({ message: "User not found" });

    const dbOtp = String(user.otp_code ?? "").padStart(6, "0");
    if (!dbOtp || dbOtp !== otpInput) {
      return res.status(400).json({ message: "Invalid OTP" });
    }

    const expiry = user.otp_expiry ? new Date(user.otp_expiry) : null;
    if (!expiry || expiry.getTime() < Date.now()) {
      return res.status(400).json({ message: "OTP expired" });
    }

    await pool.query("UPDATE users SET otp_code = NULL, otp_expiry = NULL WHERE id = ?", [user.id]);

    const token = generateToken(user);
    return res.json({
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
    return res.status(500).json({ message: "Server error" });
  }
});

// ───────────── 3) Save Phone After OTP (LOCK ONCE SET) ─────────────
router.post("/save-phone", async (req, res) => {
  try {
    const email = normalizeEmail(req.body?.email);
    const rawPhone = String(req.body?.phone ?? "").trim();
    const fullName = req.body?.fullName ? String(req.body.fullName).trim() : null;

    if (!email || !rawPhone) {
      return res.status(400).json({ message: "Missing email or phone" });
    }
    if (!isValidPhoneIN(rawPhone)) {
      return res.status(400).json({ message: "Enter a valid 10-digit Indian mobile number" });
    }

    const user = await getUserByEmail(email);
    if (!user) return res.status(404).json({ message: "User not found" });

    // 1) Cannot change once set
    const lock = await assertPhoneNotLocked(user.id, rawPhone);
    if (!lock.ok) return res.status(lock.code).json({ message: lock.msg });

    // 2) Phone must be unique globally
    const uniq = await assertPhoneAvailableForUser(user.id, rawPhone);
    if (!uniq.ok) return res.status(uniq.code).json({ message: uniq.msg });

    await pool.query(
      "UPDATE users SET phone = ?, full_name = COALESCE(?, full_name) WHERE id = ?",
      [rawPhone, fullName, user.id]
    );

    const updated = await getUserById(user.id);
    const token = generateToken(updated);

    return res.json({
      message: "Phone number saved",
      token,
      user: {
        id: updated.id,
        role: updated.role,
        fullName: updated.full_name,
        email: updated.email,
        phone: updated.phone,
      },
    });
  } catch (err) {
    console.error("❌ Save Phone Error:", err);
    return res.status(500).json({ message: "Server error" });
  }
});

// ───────────── 3b) PUT /auth/users/:id/phone (JWT-protected, LOCKED) ─────────────
router.put("/users/:id/phone", verifyToken, async (req, res) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id <= 0) {
      return res.status(400).json({ message: "Invalid user id" });
    }

    if (req.user.id !== id && req.user.role !== "admin") {
      return res.status(403).json({ message: "Forbidden" });
    }

    const rawPhone = String(req.body?.phone ?? "").trim();
    const fullNameInput = req.body?.fullName;
    const fullNameParam = typeof fullNameInput === "string" ? fullNameInput.trim() : null;

    if (!isValidPhoneIN(rawPhone)) {
      return res.status(400).json({ message: "Enter a valid 10-digit Indian mobile number" });
    }

    const user = await getUserById(id);
    if (!user) return res.status(404).json({ message: "User not found" });

    // 1) Cannot change once set (even admin; create a separate admin-only override route if needed)
    const lock = await assertPhoneNotLocked(id, rawPhone);
    if (!lock.ok) return res.status(lock.code).json({ message: lock.msg });

    // 2) Phone must be unique globally
    const uniq = await assertPhoneAvailableForUser(id, rawPhone);
    if (!uniq.ok) return res.status(uniq.code).json({ message: uniq.msg });

    await pool.query(
      "UPDATE users SET phone = ?, full_name = COALESCE(?, full_name) WHERE id = ?",
      [rawPhone, fullNameParam, id]
    );

    const updated = await getUserById(id);
    const token = generateToken(updated);

    return res.json({
      message: "Phone number saved",
      token,
      user: {
        id: updated.id,
        role: updated.role,
        fullName: updated.full_name,
        email: updated.email,
        phone: updated.phone,
      },
    });
  } catch (err) {
    console.error("❌ PUT /users/:id/phone Error:", err);
    return res.status(500).json({ message: "Server error" });
  }
});

// ───────────── 4) Basic Google Login ─────────────
router.post("/google-login", async (req, res) => {
  try {
    const email = normalizeEmail(req.body?.email);
    const fullName = req.body?.fullName ? String(req.body.fullName).trim() : null;
    if (!email) return res.status(400).json({ message: "Missing email" });

    let user = await getUserByEmail(email);
    if (!user) {
      const [ins] = await pool.query(
        "INSERT INTO users (email, full_name, role) VALUES (?, ?, 'customer')",
        [email, fullName]
      );
      const [rows] = await pool.query("SELECT * FROM users WHERE id = ?", [ins.insertId]);
      user = rows?.[0];
    }

    const token = generateToken(user);
    return res.json({
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
    return res.status(500).json({ message: "Server error" });
  }
});

module.exports = router;
