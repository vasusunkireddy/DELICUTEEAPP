const express = require('express');
const router = express.Router();
const pool = require('../db');
const jwt = require('jsonwebtoken');
const admin = require('firebase-admin');

// Firebase Admin SDK initialization
if (!admin.apps.length) {
  const serviceAccount = require('../firebase-service-account.json');
  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount),
  });
}

const JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key'; // Ensure this matches the frontend's JWT_SECRET

/** JWT middleware */
const verifyToken = (req, res, next) => {
  const token = req.headers.authorization?.split(' ')[1];
  if (!token) return res.status(401).json({ message: 'Unauthorized: No token provided' });

  try {
    req.user = jwt.verify(token, JWT_SECRET);
    next();
  } catch {
    return res.status(401).json({ message: 'Unauthorized: Invalid token' });
  }
};

/** Validate incoming notification */
const validateNotification = ({ title, message, createdAt, imageUrl }) => {
  if (!title?.trim() || !message?.trim()) {
    return 'Title and message are required';
  }
  if (imageUrl && !/^(https?:\/\/|file:\/\/|content:\/\/)/.test(imageUrl)) {
    return 'Invalid image URL';
  }
  return null;
};

router.use(verifyToken);

/** GET all notifications */
router.get('/', async (_req, res, next) => {
  try {
    const [rows] = await pool.query('SELECT * FROM notifications ORDER BY id DESC');
    res.json(rows);
  } catch (e) {
    next(e);
  }
});

/** Save FCM token for a user */
router.post('/users/push-token', async (req, res, next) => {
  try {
    const { token } = req.body;
    if (!token) {
      return res.status(400).json({ message: 'Invalid FCM token' });
    }

    const userId = req.user.id;
    await pool.query(
      'INSERT INTO push_tokens (user_id, fcm_token) VALUES (?, ?) ON DUPLICATE KEY UPDATE fcm_token=?',
      [userId, token, token]
    );
    res.json({ message: 'Push token saved' });
  } catch (e) {
    next(e);
  }
});

/** Create & instantly send notification */
router.post('/', async (req, res, next) => {
  try {
    const { title, message, imageUrl = null, createdAt = new Date().toISOString() } = req.body;
    const error = validateNotification({ title, message, createdAt, imageUrl });
    if (error) return res.status(400).json({ message: error });

    // Save to DB
    const [result] = await pool.query(
      'INSERT INTO notifications (title, message, imageUrl, createdAt, sent) VALUES (?, ?, ?, ?, 0)',
      [title.trim(), message.trim(), imageUrl, createdAt]
    );

    // Get all push tokens (default to ALL users)
    const [tokenRows] = await pool.query('SELECT fcm_token FROM push_tokens');
    const tokens = tokenRows.map(r => r.fcm_token).filter(Boolean);

    if (tokens.length > 0) {
      const notification = {
        notification: {
          title: title.trim(),
          body: message.trim(),
        },
        android: {
          notification: {
            imageUrl: imageUrl || undefined,
          },
        },
        tokens, // Send to multiple devices
      };

      const response = await admin.messaging().sendMulticast(notification);

      console.log(`✅ Sent to ${response.successCount} devices, failed: ${response.failureCount}`);

      if (response.successCount > 0) {
        await pool.query('UPDATE notifications SET sent=1 WHERE id=?', [result.insertId]);
      }
    }

    res.status(201).json({
      id: result.insertId,
      message: 'Notification saved and sent',
    });

  } catch (e) {
    next(e);
  }
});

/** Delete notification */
router.delete('/:id', async (req, res, next) => {
  try {
    const id = parseInt(req.params.id);
    if (isNaN(id) || id <= 0) return res.status(400).json({ message: 'Invalid notification ID' });

    const [result] = await pool.query('DELETE FROM notifications WHERE id=?', [id]);
    if (!result.affectedRows) return res.status(404).json({ message: 'Notification not found' });

    res.json({ message: 'Deleted' });
  } catch (e) {
    next(e);
  }
});

/** Error handler */
router.use((err, req, res, _next) => {
  console.error(err);
  res.status(500).json({ message: 'Failed to process request' });
});

module.exports = router;