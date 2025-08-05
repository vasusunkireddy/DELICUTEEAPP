const express = require('express');
const router = express.Router();
const pool = require('../db');
const { Expo } = require('expo-server-sdk');
const expo = new Expo();

/* Helper: Convert JavaScript Date to MySQL DATETIME format */
const toSQL = (d) => {
  try {
    return new Date(d).toISOString().slice(0, 19).replace('T', ' ');
  } catch (e) {
    throw new Error('Invalid date format');
  }
};

/* Helper: Validate notification payload */
const validate = ({ title, body, sendAt, target, image }) => {
  if (!title || !body || !sendAt) {
    return 'title, body, and sendAt are required';
  }
  if (!['ALL', 'FIRST_ORDER', 'VIP'].includes(target)) {
    return 'Invalid target value';
  }
  if (image && !/^https?:\/\/[^\s$.?#].[^\s]*$/.test(image)) {
    return 'Invalid image URL';
  }
  return null;
};

/* GET: List all notifications, ordered by ID descending */
router.get('/', async (_req, res, next) => {
  try {
    const [rows] = await pool.query('SELECT * FROM notifications ORDER BY id DESC');
    res.json(rows);
  } catch (e) {
    next(new Error(`Failed to list notifications: ${e.message}`));
  }
});

/* POST: Create a new notification */
router.post('/', async (req, res, next) => {
  try {
    const { title, body, target = 'ALL', sendAt, image = null } = req.body;
    const error = validate({ title, body, sendAt, target, image });
    if (error) {
      return res.status(400).json({ message: error });
    }

    const [result] = await pool.query(
      'INSERT INTO notifications (title, body, target, sendAt, image) VALUES (?, ?, ?, ?, ?)',
      [title.trim(), body.trim(), target, toSQL(sendAt), image]
    );
    res.status(201).json({ id: result.insertId });
  } catch (e) {
    next(new Error(`Failed to create notification: ${e.message}`));
  }
});

/* PUT: Update an existing notification */
router.put('/:id', async (req, res, next) => {
  try {
    const id = parseInt(req.params.id);
    if (isNaN(id) || id <= 0) {
      return res.status(400).json({ message: 'Invalid notification ID' });
    }

    const { title, body, target = 'ALL', sendAt, image = null } = req.body;
    const error = validate({ title, body, sendAt, target, image });
    if (error) {
      return res.status(400).json({ message: error });
    }

    const [result] = await pool.query(
      'UPDATE notifications SET title = ?, body = ?, target = ?, sendAt = ?, image = ? WHERE id = ?',
      [title.trim(), body.trim(), target, toSQL(sendAt), image, id]
    );

    if (result.affectedRows === 0) {
      return res.status(404).json({ message: 'Notification not found' });
    }
    res.json({ message: 'Notification updated' });
  } catch (e) {
    next(new Error(`Failed to update notification: ${e.message}`));
  }
});

/* DELETE: Remove a notification */
router.delete('/:id', async (req, res, next) => {
  try {
    const id = parseInt(req.params.id);
    if (isNaN(id) || id <= 0) {
      return res.status(400).json({ message: 'Invalid notification ID' });
    }

    const [result] = await pool.query('DELETE FROM notifications WHERE id = ?', [id]);
    if (result.affectedRows === 0) {
      return res.status(404).json({ message: 'Notification not found' });
    }
    res.json({ message: 'Notification deleted' });
  } catch (e) {
    next(new Error(`Failed to delete notification: ${e.message}`));
  }
});

/* POST: Dispatch pending notifications */
router.post('/dispatch', async (_req, res, next) => {
  try {
    const [pending] = await pool.query(
      'SELECT * FROM notifications WHERE sent = 0 AND sendAt <= NOW()'
    );

    let totalSent = 0;

    for (const n of pending) {
      // Fetch tokens based on target group
      let tokenRows = [];
      if (n.target === 'ALL') {
        [tokenRows] = await pool.query('SELECT expo_token FROM push_tokens');
      } else if (n.target === 'FIRST_ORDER') {
        [tokenRows] = await pool.query(`
          SELECT pt.expo_token
          FROM push_tokens pt
          JOIN orders o ON o.user_id = pt.user_id
          GROUP BY pt.user_id
          HAVING COUNT(o.id) = 1
        `);
      } else if (n.target === 'VIP') {
        [tokenRows] = await pool.query(`
          SELECT pt.expo_token
          FROM push_tokens pt
          JOIN orders o ON o.user_id = pt.user_id
          GROUP BY pt.user_id
          HAVING COUNT(o.id) >= 5
        `);
      }

      // Build message list
      const messages = tokenRows
        .map(({ expo_token }) =>
          Expo.isExpoPushToken(expo_token)
            ? {
                to: expo_token,
                sound: 'default',
                title: n.title,
                body: n.body,
                data: { image: n.image || undefined },
              }
            : null
        )
        .filter(Boolean);

      if (messages.length === 0) {
        console.log(`No valid tokens for notification #${n.id}`);
        continue;
      }

      // Send notifications in chunks
      const chunks = expo.chunkPushNotifications(messages);
      for (const chunk of chunks) {
        try {
          await expo.sendPushNotificationsAsync(chunk);
          totalSent += chunk.length;
        } catch (err) {
          console.error(`Failed to send notification #${n.id}: ${err.message}`);
        }
      }

      // Mark notification as sent
      await pool.query('UPDATE notifications SET sent = 1 WHERE id = ?', [n.id]);
      console.log(`📤 Sent notification #${n.id} to ${messages.length} devices`);
    }

    res.json({ sent: totalSent, batches: pending.length });
  } catch (e) {
    next(new Error(`Failed to dispatch notifications: ${e.message}`));
  }
});

module.exports = router;