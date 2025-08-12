// utils/push.js
const { Expo } = require('expo-server-sdk');
const pool     = require('../backend/db');   // db is in backend/
const expo     = new Expo();

async function sendPush(tokens, title, body, data = {}) {
  const msgs = tokens
    .filter(t => Expo.isExpoPushToken(t))
    .map(t => ({ to: t, sound: 'default', title, body, data }));
  const chunks = expo.chunkPushNotifications(msgs);
  for (const chunk of chunks) {
    try { await expo.sendPushNotificationsAsync(chunk); }
    catch (e) { console.warn('expo push error', e.message); }
  }
}

/* broadcast helper used by cron or admin */
async function broadcastNotification(n) {
  // pick tokens based on n.target
  let tokens = [];
  if (n.target === 'ALL') {
    const [rows] = await pool.query('SELECT expo_token FROM push_tokens');
    tokens = rows.map(r => r.expo_token);
  } else if (n.target === 'FIRST_ORDER') {
    const [rows] = await pool.query(`
      SELECT pt.expo_token
        FROM push_tokens pt
        JOIN orders o ON o.user_id = pt.user_id
       GROUP BY pt.user_id
      HAVING COUNT(o.id) = 1`);
    tokens = rows.map(r => r.expo_token);
  } else if (n.target === 'VIP') {
    const [rows] = await pool.query(`
      SELECT pt.expo_token
        FROM push_tokens pt
        JOIN orders o ON o.user_id = pt.user_id
       GROUP BY pt.user_id
      HAVING COUNT(o.id) >= 5`);
    tokens = rows.map(r => r.expo_token);
  }

  if (tokens.length) {
    await sendPush(tokens, n.title, n.body, { notificationId: n.id });
    await pool.query('UPDATE notifications SET sent = 1 WHERE id = ?', [n.id]);
    console.log(`📤 broadcast #${n.id} sent to ${tokens.length} devices`);
  }
}

module.exports = { sendPush, broadcastNotification };
