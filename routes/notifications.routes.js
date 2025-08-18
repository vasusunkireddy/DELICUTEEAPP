// routes/notifications.routes.js
const express = require('express');
const router = express.Router();
const pool = require('../db');
const jwt = require('jsonwebtoken');
const admin = require('firebase-admin');
const multer = require('multer');
const cloudinary = require('cloudinary').v2;

// ───────────────────────── Firebase Admin ─────────────────────────
if (!admin.apps.length) {
  const serviceAccount = require('../firebase-service-account.json');
  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount),
  });
}

// ───────────────────────── Cloudinary ─────────────────────────
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});
const UPLOAD_FOLDER = process.env.CLOUDINARY_UPLOAD_FOLDER || 'delicute/notifications';

// Multer in-memory (no disk files)
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 }, // 5MB
});

// ───────────────────────── Auth ─────────────────────────
const JWT_SECRET =
  process.env.JWT_SECRET ||
  '7f1ac914602d012f7147b4f39701f729fa042f4067f7b976efb0a8bfb3e6be34';

const verifyToken = (req, res, next) => {
  const token = req.headers.authorization?.split(' ')[1];
  if (!token) return res.status(401).json({ message: 'Unauthorized: No token provided' });

  try {
    req.user = jwt.verify(token, JWT_SECRET);
    next();
  } catch (err) {
    return res.status(401).json({ message: 'Unauthorized: Invalid token' });
  }
};

// Optional: you can loosen auth on image upload/token if needed.
// For now keep admin-only by default:
router.use(verifyToken);

// ───────────────────────── Helpers ─────────────────────────
const validateNotification = ({ title, message, imageUrl }) => {
  if (!title?.trim() || !message?.trim()) return 'Title and message are required';
  if (imageUrl && !/^https?:\/\//i.test(imageUrl)) return 'Invalid image URL';
  return null;
};

const chunk = (arr, size) => {
  const out = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
};

// ───────────────────────── Routes ─────────────────────────

// Save FCM token (matches app call: POST /api/push-tokens { fcm_token })
router.post('/push-tokens', async (req, res, next) => {
  try {
    const { fcm_token } = req.body;
    if (!fcm_token) return res.status(400).json({ message: 'Invalid FCM token' });

    const userId = req.user.id;
    await pool.query(
      `INSERT INTO push_tokens (user_id, fcm_token)
       VALUES (?, ?)
       ON DUPLICATE KEY UPDATE fcm_token = VALUES(fcm_token)`,
      [userId, fcm_token]
    );

    res.json({ message: 'Push token saved' });
  } catch (e) {
    next(e);
  }
});

// Backward compatibility for your old path/body
router.post('/users/push-token', async (req, res, next) => {
  try {
    const token = req.body.token || req.body.fcm_token;
    if (!token) return res.status(400).json({ message: 'Invalid FCM token' });

    const userId = req.user.id;
    await pool.query(
      `INSERT INTO push_tokens (user_id, fcm_token)
       VALUES (?, ?)
       ON DUPLICATE KEY UPDATE fcm_token = VALUES(fcm_token)`,
      [userId, token]
    );

    res.json({ message: 'Push token saved' });
  } catch (e) {
    next(e);
  }
});

// Image upload (matches app call: POST /api/uploads/notification-image)
router.post(
  '/uploads/notification-image',
  upload.single('file'),
  async (req, res, next) => {
    try {
      if (!req.file) return res.status(400).json({ message: 'No file uploaded' });

      // Upload buffer to Cloudinary
      const result = await cloudinary.uploader.upload_stream(
        {
          resource_type: 'image',
          folder: UPLOAD_FOLDER,
          overwrite: true,
          invalidate: true,
        },
        (error, uploadResult) => {
          if (error) return next(error);
          res.json({ url: uploadResult.secure_url });
        }
      );

      // Write buffer into the stream
      result.end(req.file.buffer);
    } catch (e) {
      next(e);
    }
  }
);

// Create & send notification (matches app call: POST /api/notifications)
router.post('/notifications', async (req, res, next) => {
  try {
    const { title, message, imageUrl = null } = req.body;
    const error = validateNotification({ title, message, imageUrl });
    if (error) return res.status(400).json({ message: error });

    // Save to DB — use server time to avoid ISO/TZ issues
    const [result] = await pool.query(
      `INSERT INTO notifications (title, message, imageUrl, createdAt, sent)
       VALUES (?, ?, ?, NOW(), 0)`,
      [title.trim(), message.trim(), imageUrl]
    );

    // Fetch tokens
    const [tokenRows] = await pool.query('SELECT fcm_token FROM push_tokens');
    const tokens = tokenRows.map(r => r.fcm_token).filter(Boolean);

    // Send via Firebase Admin (chunk by 500)
    let success = 0;
    let fail = 0;

    if (tokens.length) {
      const batches = chunk(tokens, 500);
      for (const batch of batches) {
        const msg = {
          notification: {
            title: title.trim(),
            body: message.trim(),
            // Some Android vendors only honor image when present at top-level too
            ...(imageUrl ? { imageUrl } : {}),
          },
          android: {
            notification: {
              ...(imageUrl ? { imageUrl } : {}),
              // channelId: 'default', // if you configured channels
              priority: 'HIGH',
            },
          },
          tokens: batch,
          data: {
            // Optional: useful inside app
            imageUrl: imageUrl || '',
          },
        };

        const resp = await admin.messaging().sendMulticast(msg);
        success += resp.successCount;
        fail += resp.failureCount;
      }

      if (success > 0) {
        await pool.query('UPDATE notifications SET sent = 1 WHERE id = ?', [result.insertId]);
      }
    }

    res.status(201).json({
      id: result.insertId,
      message: `Notification saved. Sent: ${success}, Failed: ${fail}`,
      sent: success > 0 ? 1 : 0,
    });
  } catch (e) {
    next(e);
  }
});

// List notifications (matches app GET /api/notifications)
router.get('/notifications', async (_req, res, next) => {
  try {
    const [rows] = await pool.query(
      'SELECT id, title, message, imageUrl, createdAt, sent FROM notifications ORDER BY id DESC'
    );
    res.json(rows);
  } catch (e) {
    next(e);
  }
});

// Delete notification
router.delete('/notifications/:id', async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    if (!id) return res.status(400).json({ message: 'Invalid notification ID' });

    const [result] = await pool.query('DELETE FROM notifications WHERE id = ?', [id]);
    if (!result.affectedRows) return res.status(404).json({ message: 'Notification not found' });

    res.json({ message: 'Deleted' });
  } catch (e) {
    next(e);
  }
});

// Error handler
router.use((err, req, res, _next) => {
  console.error('Push/Notifications error:', err);
  res.status(500).json({ message: 'Failed to process request' });
});

module.exports = router;
