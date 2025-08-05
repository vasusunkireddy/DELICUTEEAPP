const express = require('express');
const { body, validationResult } = require('express-validator');
const pool = require('../db');
const authenticateToken = require('../middleware/auth');
const multer = require('multer');
const path = require('path');
const fs = require('fs');

const router = express.Router();

const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    const uploadPath = path.join(__dirname, '..', 'uploads', 'avatars');
    fs.mkdirSync(uploadPath, { recursive: true });
    cb(null, uploadPath);
  },
  filename: function (req, file, cb) {
    const ext = path.extname(file.originalname);
    cb(null, `user_${req.user.id}_${Date.now()}${ext}`);
  },
});
const upload = multer({
  storage,
  fileFilter: function (req, file, cb) {
    if (!file.mimetype.startsWith('image/')) {
      return cb(new Error('Only images allowed'), false);
    }
    cb(null, true);
  },
  limits: { fileSize: 2 * 1024 * 1024 }, // 2MB max
});

// GET /api/profile
router.get('/', authenticateToken, async (req, res) => {
  try {
    const [rows] = await pool.query(
      'SELECT id, full_name AS fullName, email, phone, avatar_url AS avatarUrl FROM users WHERE id = ?',
      [req.user.id]
    );
    if (!rows.length) return res.status(404).json({ message: 'User not found' });
    res.json(rows[0]);
  } catch (err) {
    console.error('Error fetching profile:', err);
    res.status(500).json({ message: 'Server error' });
  }
});

// PUT /api/profile
router.put(
  '/',
  authenticateToken,
  upload.single('avatar'), // Accept 'avatar' file if sent
  [
    body('fullName').trim().notEmpty().withMessage('Full name is required'),
    body('email').isEmail().withMessage('Valid email is required'),
    body('phone')
      .optional({ checkFalsy: true })
      .isMobilePhone('en-IN')
      .withMessage('Enter a valid Indian mobile number'),
  ],
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ message: 'Validation failed', errors: errors.array() });
    }
    const { fullName, email, phone } = req.body;

    // Handle avatar upload
    let avatarUrl;
    if (req.file) {
      avatarUrl = `/uploads/avatars/${req.file.filename}`;
    }

    try {
      // Check duplicate email
      const [dup] = await pool.query(
        'SELECT id FROM users WHERE email = ? AND id <> ?',
        [email, req.user.id]
      );
      if (dup.length) {
        // (Optional: delete uploaded image if not used)
        if (avatarUrl) {
          fs.unlink(path.join(__dirname, '..', avatarUrl), () => {});
        }
        return res.status(400).json({ message: 'Email is already in use' });
      }

      // Get old avatar before updating, so we can delete it later
      let oldAvatarUrl;
      if (avatarUrl) {
        const [userRows] = await pool.query('SELECT avatar_url FROM users WHERE id=?', [req.user.id]);
        oldAvatarUrl = userRows[0]?.avatar_url;
      }

      // Update user info (and avatar if uploaded)
      let sql = 'UPDATE users SET full_name = ?, email = ?, phone = ?';
      const params = [fullName, email, phone || null];
      if (avatarUrl) {
        sql += ', avatar_url = ?';
        params.push(avatarUrl);
      }
      sql += ' WHERE id = ?';
      params.push(req.user.id);

      await pool.query(sql, params);

      // Remove old avatar file if new one uploaded
      if (avatarUrl && oldAvatarUrl && oldAvatarUrl !== avatarUrl) {
        const oldPath = path.join(__dirname, '..', oldAvatarUrl);
        fs.unlink(oldPath, (err) => {
          if (err) console.warn('Failed to delete old avatar:', err.message);
        });
      }

      // Return updated profile
      const [updatedUser] = await pool.query(
        'SELECT id, full_name AS fullName, email, phone, avatar_url AS avatarUrl FROM users WHERE id = ?',
        [req.user.id]
      );
      if (!updatedUser.length) {
        return res.status(404).json({ message: 'User not found' });
      }
      res.json(updatedUser[0]);
    } catch (err) {
      console.error('Error updating profile:', err);
      res.status(500).json({ message: 'Server error' });
    }
  }
);

module.exports = router;
