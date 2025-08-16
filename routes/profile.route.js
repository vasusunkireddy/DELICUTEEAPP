// routes/profile.route.js
const express = require('express');
const { body, validationResult } = require('express-validator');
const pool = require('../db');
const authenticateToken = require('../middleware/auth');
const multer = require('multer');
const path = require('path');
const fs = require('fs');

const router = express.Router();

/* ───────────────────────── Multer (optional local avatars) ───────────────────────── */
const uploadPath = path.join(__dirname, '..', 'uploads', 'avatars');
fs.mkdirSync(uploadPath, { recursive: true });

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, uploadPath),
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname || '.jpg');
    cb(null, `user_${req.user.id}_${Date.now()}${ext}`);
  },
});

const upload = multer({
  storage,
  fileFilter: (_req, file, cb) => {
    if (!file.mimetype || !file.mimetype.startsWith('image/')) {
      return cb(new Error('Only images allowed'), false);
    }
    cb(null, true);
  },
  limits: { fileSize: 2 * 1024 * 1024 }, // 2MB
});

/* ───────────────────────── Helpers ───────────────────────── */
const norm = (v) => {
  if (v === undefined || v === null) return undefined;
  const s = String(v).trim();
  return s === '' ? undefined : s;
};

/* ───────────────────────── GET /api/profile ───────────────────────── */
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

/* ───────────────────────── PUT /api/profile ─────────────────────────
Accepts:
- JSON body: { fullName?, email?, phone?, avatar_url? }
- OR multipart/form-data with field 'avatar' (local upload)
Only provided, non-empty fields are updated.
--------------------------------------------------------------------- */
router.put(
  '/',
  authenticateToken,
  upload.single('avatar'), // optional file
  [
    body('fullName').optional({ values: 'falsy' }).isString().withMessage('Full name must be a string'),
    body('email').optional({ values: 'falsy' }).isEmail().withMessage('Valid email is required'),
    body('phone')
      .optional({ values: 'falsy' })
      // Keep it flexible: accept common phone chars; you can swap to isMobilePhone('en-IN') if you want stricter.
      .matches(/^[0-9+\-\s().]{7,20}$/)
      .withMessage('Enter a valid phone number'),
    body('avatar_url').optional({ values: 'falsy' }).isString(),
  ],
  async (req, res) => {
    // Validate request
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      // Cleanup uploaded file on validation failure
      if (req.file) {
        fs.unlink(path.join(uploadPath, req.file.filename), () => {});
      }
      return res.status(400).json({ message: 'Validation failed', errors: errors.array() });
    }

    // Normalize inputs (empty -> undefined, trims strings)
    const fullName = norm(req.body.fullName);
    const email = norm(req.body.email);
    const phone = norm(req.body.phone);

    // Determine avatar updates:
    // Priority: uploaded file > avatar_url from body > (no change)
    let newAvatarUrl;
    if (req.file) {
      newAvatarUrl = `/uploads/avatars/${req.file.filename}`;
    } else {
      const avatarUrlBody = norm(req.body.avatar_url);
      if (avatarUrlBody !== undefined) newAvatarUrl = avatarUrlBody;
    }

    try {
      // Grab existing user (needed for returning and old-avatar cleanup)
      const [existingRows] = await pool.query(
        'SELECT id, full_name, email AS existingEmail, phone AS existingPhone, avatar_url AS existingAvatar FROM users WHERE id = ?',
        [req.user.id]
      );
      if (!existingRows.length) {
        if (req.file) fs.unlink(path.join(uploadPath, req.file.filename), () => {});
        return res.status(404).json({ message: 'User not found' });
      }
      const existing = existingRows[0];

      // If changing email, ensure uniqueness
      if (email !== undefined) {
        const [dup] = await pool.query(
          'SELECT id FROM users WHERE email = ? AND id <> ?',
          [email, req.user.id]
        );
        if (dup.length) {
          if (req.file) fs.unlink(path.join(uploadPath, req.file.filename), () => {});
          return res.status(400).json({ message: 'Email is already in use' });
        }
      }

      // Build dynamic update: ONLY include fields that are defined (non-empty after trim)
      const updates = [];
      const params = [];

      if (fullName !== undefined) {
        updates.push('full_name = ?');
        params.push(fullName);
      }
      if (email !== undefined) {
        updates.push('email = ?');
        params.push(email);
      }
      if (phone !== undefined) {
        updates.push('phone = ?');
        params.push(phone);
      }
      if (newAvatarUrl !== undefined) {
        updates.push('avatar_url = ?');
        params.push(newAvatarUrl);
      }

      if (updates.length === 0) {
        // Nothing to change; return current profile as-is
        const [cur] = await pool.query(
          'SELECT id, full_name AS fullName, email, phone, avatar_url AS avatarUrl FROM users WHERE id = ?',
          [req.user.id]
        );
        return res.json(cur[0]);
      }

      // Stamp updated_at if your table has it
      // (Uncomment if you have an updated_at column)
      // updates.push('updated_at = NOW()');

      const sql = `UPDATE users SET ${updates.join(', ')} WHERE id = ?`;
      params.push(req.user.id);
      await pool.query(sql, params);

      // If avatar changed and old one was a LOCAL file (not a remote URL), delete it
      if (
        newAvatarUrl !== undefined &&
        existing.existingAvatar &&
        !/^https?:\/\//i.test(existing.existingAvatar) // local path previously
      ) {
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
      // Cleanup just-uploaded local file on failure
      if (req.file) {
        fs.unlink(path.join(uploadPath, req.file.filename), () => {});
      }

      if (err && err.code === 'ER_DUP_ENTRY') {
        return res.status(409).json({ message: 'Email already in use' });
      }
      if (err && err.code === 'ER_BAD_NULL_ERROR') {
        return res.status(400).json({ message: 'Required fields cannot be null' });
      }
      return res.status(500).json({ message: 'Server error' });
    }
  }
);

module.exports = router;
