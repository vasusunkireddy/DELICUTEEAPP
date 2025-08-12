// routes/profile.route.js
const express = require('express');
const { body, validationResult } = require('express-validator');
const pool = require('../db');
const authenticateToken = require('../middleware/auth');
const multer = require('multer');
const path = require('path');
const fs = require('fs');

const router = express.Router();

/* ─── Multer for OPTIONAL local avatar uploads ─── */
const uploadPath = path.join(__dirname, '..', 'uploads', 'avatars');
fs.mkdirSync(uploadPath, { recursive: true });

const storage = multer.diskStorage({
  destination: function (_req, _file, cb) {
    cb(null, uploadPath);
  },
  filename: function (req, file, cb) {
    const ext = path.extname(file.originalname || '.jpg');
    cb(null, `user_${req.user.id}_${Date.now()}${ext}`);
  },
});

const upload = multer({
  storage,
  fileFilter: function (_req, file, cb) {
    if (!file.mimetype.startsWith('image/')) {
      return cb(new Error('Only images allowed'), false);
    }
    cb(null, true);
  },
  limits: { fileSize: 2 * 1024 * 1024 }, // 2MB
});

/* ─── GET /api/profile ─── */
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

/* ─── PUT /api/profile ───
   Accepts:
   - JSON body: { fullName?, email?, phone?, avatar_url? }  (Cloudinary secure URL)
   - OR multipart/form-data with field 'avatar' for local upload
   All fields are optional; only provided ones are updated.
---------------------------------------------------------------- */
router.put(
  '/',
  authenticateToken,
  upload.single('avatar'), // optional
  [
    body('fullName').optional({ checkFalsy: true }).trim().notEmpty().withMessage('Full name cannot be empty'),
    body('email').optional({ checkFalsy: true }).isEmail().withMessage('Valid email is required'),
    body('phone')
      .optional({ checkFalsy: true })
      .isMobilePhone('en-IN')
      .withMessage('Enter a valid Indian mobile number'),
    body('avatar_url').optional({ checkFalsy: true }).isString(),
  ],
  async (req, res) => {
    // Validate
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ message: 'Validation failed', errors: errors.array() });
    }

    const { fullName, email, phone } = req.body;

    // Determine new avatar URL:
    // Priority: uploaded file > avatar_url from body > (no change)
    let newAvatarUrl = null;
    if (req.file) {
      newAvatarUrl = `/uploads/avatars/${req.file.filename}`; // local path served by server
    } else if (typeof req.body.avatar_url === 'string' && req.body.avatar_url.trim() !== '') {
      newAvatarUrl = req.body.avatar_url.trim(); // Cloudinary secure URL
    }

    try {
      // If changing email, check duplicates
      if (email) {
        const [dup] = await pool.query(
          'SELECT id FROM users WHERE email = ? AND id <> ?',
          [email, req.user.id]
        );
        if (dup.length) {
          // cleanup just-uploaded local file if any
          if (req.file) {
            const justUploaded = path.join(uploadPath, req.file.filename);
            fs.unlink(justUploaded, () => {});
          }
          return res.status(400).json({ message: 'Email is already in use' });
        }
      }

      // Fetch existing user to preserve fields and possibly delete old local avatar
      const [existingRows] = await pool.query(
        'SELECT full_name, email AS existingEmail, phone AS existingPhone, avatar_url AS existingAvatar FROM users WHERE id = ?',
        [req.user.id]
      );
      if (!existingRows.length) {
        // cleanup just-uploaded local file if any
        if (req.file) {
          const justUploaded = path.join(uploadPath, req.file.filename);
          fs.unlink(justUploaded, () => {});
        }
        return res.status(404).json({ message: 'User not found' });
      }
      const existing = existingRows[0];

      // Build update dynamically
      const updates = [];
      const params = [];

      if (typeof fullName !== 'undefined') { updates.push('full_name = ?'); params.push(fullName || null); }
      if (typeof email !== 'undefined')    { updates.push('email = ?');     params.push(email || null); }
      if (typeof phone !== 'undefined')    { updates.push('phone = ?');     params.push(phone || null); }
      if (newAvatarUrl !== null)           { updates.push('avatar_url = ?');params.push(newAvatarUrl); }

      if (updates.length === 0) {
        // Nothing to update; just return current profile
        const [cur] = await pool.query(
          'SELECT id, full_name AS fullName, email, phone, avatar_url AS avatarUrl FROM users WHERE id = ?',
          [req.user.id]
        );
        return res.json(cur[0]);
      }

      const sql = `UPDATE users SET ${updates.join(', ')} WHERE id = ?`;
      params.push(req.user.id);
      await pool.query(sql, params);

      // If avatar changed and old was a LOCAL file (not Cloudinary), delete it
      if (newAvatarUrl !== null && existing.existingAvatar && !/^https?:\/\//i.test(existing.existingAvatar)) {
        const oldLocalPath = path.join(__dirname, '..', existing.existingAvatar.replace(/^\//, ''));
        fs.unlink(oldLocalPath, (err) => {
          if (err) console.warn('Failed to delete old avatar:', err.message);
        });
      }

      // Return updated profile
      const [updated] = await pool.query(
        'SELECT id, full_name AS fullName, email, phone, avatar_url AS avatarUrl FROM users WHERE id = ?',
        [req.user.id]
      );
      if (!updated.length) return res.status(404).json({ message: 'User not found' });
      res.json(updated[0]);

    } catch (err) {
      console.error('Error updating profile:', err);
      // cleanup just-uploaded local file if any on failure
      if (req.file) {
        const justUploaded = path.join(uploadPath, req.file.filename);
        fs.unlink(justUploaded, () => {});
      }
      res.status(500).json({ message: 'Server error' });
    }
  }
);

module.exports = router;
