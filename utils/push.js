const { Expo } = require('expo-server-sdk');
const pool = require('../db');
const expo = new Expo();

/**
 * Send push notifications to a list of tokens
 */
async function sendPush(tokens, title, body, data = {}) {
  if (!Array.isArray(tokens) || !tokens.length) {
    throw new Error('No valid tokens provided');
  }
  if (!title?.trim() || !body?.trim()) {
    throw new Error('Title and body are required');
  }

  const messages = tokens
    .filter((t) => t && Expo.isExpoPushToken(t))
    .map((t) => ({
      to: t,
      sound: 'default',
      title: title.trim(),
      body: body.trim(),
      data: {
        ...(data || {}),
        ...(data.notificationId ? { notificationId: data.notificationId } : {}),
        ...(data.image ? { image: data.image } : {}),
      },
    }));

  if (!messages.length) {
    throw new Error('No valid Expo push tokens found');
  }

  const invalidTokens = [];
  let sentCount = 0;

  const chunks = expo.chunkPushNotifications(messages);
  for (const chunk of chunks) {
    try {
      const receipts = await expo.sendPushNotificationsAsync(chunk);
      sentCount += chunk.length;

      receipts.forEach((receipt, idx) => {
        if (receipt.status === 'error') {
          const token = chunk[idx].to;
          const errDetail = receipt.details?.error || 'Unknown error';
          console.error(`[${new Date().toISOString()}] Push error for ${token}: ${errDetail}`);

          if (errDetail === 'DeviceNotRegistered') {
            invalidTokens.push(token);
          }
        }
      });
    } catch (err) {
      console.error(`[${new Date().toISOString()}] Failed to send push chunk: ${err.message}`);
    }
  }

  if (invalidTokens.length) {
    try {
      await pool.query(
        `DELETE FROM push_tokens WHERE expo_token IN (${invalidTokens.map(() => '?').join(',')})`,
        invalidTokens
      );
      console.log(
        `[${new Date().toISOString()}] Removed ${invalidTokens.length} invalid push tokens`
      );
    } catch (err) {
      console.error(`[${new Date().toISOString()}] Failed to remove invalid tokens: ${err.message}`);
    }
  }

  return { sentCount, invalidTokens };
}

/**
 * Broadcast a scheduled notification to its target audience
 */
async function broadcastNotification(n) {
  if (!n?.id || !n?.title || !n?.body || !n?.target) {
    throw new Error(`Invalid notification data: ${JSON.stringify(n)}`);
  }

  const [statusCheck] = await pool.query(
    'SELECT sent FROM notifications WHERE id = ? LIMIT 1',
    [n.id]
  );
  if (statusCheck.length && statusCheck[0].sent) {
    console.log(`[${new Date().toISOString()}] Notification #${n.id} already sent`);
    return { sentCount: 0, message: 'Already sent' };
  }

  let tokens = [];
  try {
    if (n.target === 'ALL') {
      const [rows] = await pool.query(
        'SELECT expo_token FROM push_tokens WHERE expo_token IS NOT NULL'
      );
      tokens = rows.map((r) => r.expo_token);
    } else if (n.target === 'FIRST_ORDER') {
      const [rows] = await pool.query(`
        SELECT pt.expo_token
        FROM push_tokens pt
        JOIN orders o ON o.user_id = pt.user_id
        WHERE pt.expo_token IS NOT NULL
        GROUP BY pt.user_id
        HAVING COUNT(o.id) = 1
      `);
      tokens = rows.map((r) => r.expo_token);
    } else if (n.target === 'VIP') {
      const [rows] = await pool.query(`
        SELECT pt.expo_token
        FROM push_tokens pt
        JOIN orders o ON o.user_id = pt.user_id
        WHERE pt.expo_token IS NOT NULL
        GROUP BY pt.user_id
        HAVING COUNT(o.id) >= 5
      `);
      tokens = rows.map((r) => r.expo_token);
    }
  } catch (err) {
    throw new Error(`Failed to fetch tokens: ${err.message}`);
  }

  if (!tokens.length) {
    console.log(`[${new Date().toISOString()}] No tokens match target ${n.target}`);
    return { sentCount: 0, message: `No tokens match target ${n.target}` };
  }

  try {
    const { sentCount, invalidTokens } = await sendPush(tokens, n.title, n.body, {
      notificationId: n.id,
      image: n.image || undefined,
    });

    if (sentCount > 0) {
      await pool.query('UPDATE notifications SET sent = 1 WHERE id = ?', [n.id]);
      console.log(
        `[${new Date().toISOString()}] Broadcast #${n.id} sent to ${sentCount} devices, removed ${invalidTokens.length} invalid tokens`
      );
    }

    return { sentCount, message: `Sent to ${sentCount} devices` };
  } catch (err) {
    throw new Error(`Failed to broadcast: ${err.message}`);
  }
}

module.exports = { sendPush, broadcastNotification };
