const express = require('express');
const jwt = require('jsonwebtoken');
const pool = require('../db');
const nodemailer = require('nodemailer');
const { OAuth2Client } = require('google-auth-library');
require('dotenv').config();

const router = express.Router();
const googleClient = new OAuth2Client();
const ADMIN_EMAIL = 'contactdelicute@gmail.com';

// ─────────────────── FAST Send OTP ───────────────────
router.post('/send-otp', async (req, res) => {
  const { email } = req.body;
  if (!email) return res.status(400).json({ message: 'Email is required' });

  try {
    // Admin bypass
    if (email === ADMIN_EMAIL) {
      const [adminRow] = await pool.query('SELECT * FROM users WHERE email = ?', [email]);
      if (!adminRow.length || adminRow[0].role !== 'admin') {
        return res.status(403).json({ message: 'Unauthorized admin access' });
      }

      const admin = adminRow[0];
      const token = jwt.sign({ id: admin.id, role: admin.role }, process.env.JWT_SECRET, {
        expiresIn: '7d',
      });

      return res.json({
        message: 'Admin login bypassed OTP',
        token,
        user: {
          id: admin.id,
          role: admin.role,
          fullName: admin.full_name,
          email: admin.email,
          phone: admin.phone,
        },
      });
    }

    // Check if user exists
    const [existing] = await pool.query('SELECT * FROM users WHERE email = ?', [email]);
    let user;

    if (existing.length) {
      user = existing[0];
    } else {
      // Create new user
      const [result] = await pool.query(
        'INSERT INTO users (full_name, email, phone, password_hash, role) VALUES (?, ?, ?, ?, ?)',
        ['New User', email, '', 'otp_placeholder', 'customer']
      );
      const [created] = await pool.query('SELECT * FROM users WHERE id = ?', [result.insertId]);
      user = created[0];
    }

    // Generate OTP and save to DB
    const otp = Math.floor(100000 + Math.random() * 900000);
    await pool.query(
      'UPDATE users SET otp_code = ?, otp_created_at = NOW() WHERE id = ?',
      [otp, user.id]
    );

    // === Respond to frontend instantly (before sending mail) ===
    res.json({ message: 'OTP sent to your email' });

    // === Send email in background, do not await ===
    const transporter = nodemailer.createTransport({
      service: 'gmail',
      auth: {
        user: process.env.MAIL_USER,
        pass: process.env.MAIL_PASS,
      },
    });

    transporter.sendMail({
      from: `Delicute <${process.env.MAIL_USER}>`,
      to: email,
      subject: 'Delicute OTP Login',
      html: `<h3>Hello ${user.full_name},</h3><p>Your login OTP is <b>${otp}</b>. It expires in 10 minutes.</p>`,
    }).catch((err) => {
      console.error('Background OTP email failed:', err);
    });

  } catch (err) {
    console.error('Send OTP Error:', err);
    // Only respond with error if headers were not sent (should be rare)
    if (!res.headersSent) {
      res.status(500).json({ message: 'Server error' });
    }
  }
});

// ─────────────────── Verify OTP ───────────────────
router.post('/verify-otp', async (req, res) => {
  const { email, otp } = req.body;
  if (!email || !otp) return res.status(400).json({ message: 'Missing email or OTP' });

  try {
    const [rows] = await pool.query('SELECT * FROM users WHERE email = ?', [email]);
    if (!rows.length) return res.status(404).json({ message: 'User not found' });

    const user = rows[0];
    const { otp_code, otp_created_at } = user;

    if (String(otp_code) !== String(otp)) {
      return res.status(400).json({ message: 'Invalid OTP' });
    }

    const diffMinutes = (Date.now() - new Date(otp_created_at)) / 1000 / 60;
    if (diffMinutes > 10) {
      return res.status(400).json({ message: 'OTP expired' });
    }

    const token = jwt.sign({ id: user.id, role: user.role }, process.env.JWT_SECRET, {
      expiresIn: '7d',
    });

    await pool.query('UPDATE users SET otp_code = NULL, otp_created_at = NULL WHERE id = ?', [user.id]);

    res.json({
      message: 'OTP verified',
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
    console.error('Verify OTP Error:', err);
    res.status(500).json({ message: 'Server error' });
  }
});

// ─────────────────── Save Phone Number (secure & idempotent) ───────────────────
router.put('/users/:id/phone', async (req, res) => {
  const { phone } = req.body;
  const { id } = req.params;
  const authHeader = req.headers.authorization;

  if (!authHeader) {
    return res.status(401).json({ message: 'No authorization header' });
  }
  const token = authHeader.split(' ')[1];
  let decoded;
  try {
    decoded = jwt.verify(token, process.env.JWT_SECRET);
  } catch (err) {
    return res.status(401).json({ message: 'Invalid or expired token' });
  }
  // User can only update their own profile
  if (parseInt(decoded.id) !== parseInt(id)) {
    return res.status(403).json({ message: 'Cannot update another user\'s phone' });
  }

  if (!/^\d{10}$/.test(phone)) {
    return res.status(400).json({ message: 'Invalid phone number' });
  }

  try {
    // Get current user's phone
    const [rows] = await pool.query('SELECT email, phone FROM users WHERE id = ?', [id]);
    if (!rows.length) return res.status(404).json({ message: 'User not found' });

    const existingPhone = rows[0].phone;

    // 1. Already set to this phone: allow (idempotent)
    if (existingPhone === phone) {
      return res.json({ message: 'Phone number already registered' });
    }
    // 2. Already set to another number: block
    if (existingPhone && existingPhone !== phone) {
      return res.status(400).json({ message: 'Phone number already registered and cannot be changed' });
    }
    // 3. If phone used by another account: block
    const [samePhone] = await pool.query('SELECT id, email FROM users WHERE phone = ?', [phone]);
    if (samePhone.length && samePhone[0].id != id) {
      return res.status(400).json({ message: 'Phone number already used with another account/email' });
    }

    // 4. Set phone for the user
    await pool.query('UPDATE users SET phone = ? WHERE id = ?', [phone, id]);
    res.json({ message: 'Phone number saved' });
  } catch (err) {
    console.error('Save Phone Error:', err);
    res.status(500).json({ message: 'Server error' });
  }
});


// ─────────────────── Google Login ───────────────────
router.post('/google-login', async (req, res) => {
  const { id_token } = req.body; // Expecting id_token from Expo frontend
  if (!id_token) {
    return res.status(400).json({ message: 'ID token required' });
  }

  try {
    // ✅ Verify the ID token directly
    const ticket = await googleClient.verifyIdToken({
      idToken: id_token,
      audience: process.env.GOOGLE_CLIENT_ID, // Your Google client ID
    });

    const payload = ticket.getPayload();
    const googleId = payload.sub;
    const email = payload.email;
    const fullName = payload.name || 'Google User';

    if (!googleId || !email) {
      return res.status(400).json({ message: 'Invalid Google token payload' });
    }

    let user;

    // Check if user already linked with this Google ID
    const [byGoogleId] = await pool.query('SELECT * FROM users WHERE google_id = ?', [googleId]);
    if (byGoogleId.length) {
      user = byGoogleId[0];
    } else {
      // Check if same email exists
      const [byEmail] = await pool.query('SELECT * FROM users WHERE email = ?', [email]);
      if (byEmail.length) {
        user = byEmail[0];
        // Link Google account
        await pool.query('UPDATE users SET google_id = ? WHERE id = ?', [googleId, user.id]);
      } else {
        // Create a new user account
        const [ins] = await pool.query(
          'INSERT INTO users (full_name, email, google_id, phone, password_hash, role) VALUES (?, ?, ?, ?, ?, ?)',
          [fullName, email, googleId, '', 'google_placeholder', 'customer']
        );
        const [rows] = await pool.query('SELECT * FROM users WHERE id = ?', [ins.insertId]);
        user = rows[0];
      }
    }

    // Generate JWT token
    const token = jwt.sign({ id: user.id, role: user.role }, process.env.JWT_SECRET, {
      expiresIn: '7d',
    });

    // Send response
    res.json({
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
    console.error('Google Login Error:', err);
    res.status(500).json({ message: 'Google login failed' });
  }
});


module.exports = router;
