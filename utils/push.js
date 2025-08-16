// utils/push.js
const { Expo } = require('expo-server-sdk');
const pool = require('../db');
const admin = require('firebase-admin');

let fcmEnabled = false;

// ─── Try initializing Firebase Admin (optional) ───
if (!admin.apps.length) {
  try {
    const serviceAccount = require('../firebase-service-account.json'); // ✅ correct relative path
    admin.initializeApp({
      credential: admin.credential.cert(serviceAccount),
    });
    fcmEnabled = true;
    console.log("✅ Firebase Admin initialized");
  } catch (e) {
    console.log("⚠️ Firebase Admin not initialized (missing service account). FCM disabled.");
  }
}

const expo = new Expo();

/**
 * Send push via Expo Push Service
 */
async function sendExpoPush(tokens, title, body, data = {}) {
  try {
    const msgs = tokens
      .filter((t) => Expo.isExpoPushToken(t))
      .map((t) => ({ to: t, sound: 'default', title, body, data }));

    if (!msgs.length) {
      console.log("ℹ️ No valid Expo tokens");
      return;
    }

    const chunks = expo.chunkPushNotifications(msgs);
    for (const chunk of chunks) {
      try {
        await expo.sendPushNotificationsAsync(chunk);
      } catch (e) {
        console.log("⚠️ Expo push error:", e.message);
      }
    }
  } catch (err) {
    console.log("⚠️ sendExpoPush failed:", err.message);
  }
}

/**
 * Send push via Firebase Cloud Messaging
 */
async function sendFCMPush(tokens, title, body, data = {}) {
  if (!fcmEnabled) {
    console.log("ℹ️ Skipping FCM push (Firebase not initialized)");
    return;
  }

  try {
    if (!tokens.length) {
      console.log("ℹ️ No valid FCM tokens");
      return;
    }

    await admin.messaging().sendEachForMulticast({
      tokens,
      notification: { title, body },
      data: { ...data },
    });
  } catch (err) {
    console.log("⚠️ FCM push error:", err.message);
  }
}

/**
 * Broadcast notification based on target group
 */
async function broadcastNotification(n) {
  try {
    let tokenRows = [];

    try {
      if (n.target === 'ALL') {
        [tokenRows] = await pool.query(
          'SELECT expo_token, fcm_token FROM push_tokens'
        );
      } else if (n.target === 'FIRST_ORDER') {
        [tokenRows] = await pool.query(`
          SELECT pt.expo_token, pt.fcm_token
          FROM push_tokens pt
          JOIN orders o ON o.user_id = pt.user_id
          GROUP BY pt.user_id
          HAVING COUNT(o.id) = 1
        `);
      } else if (n.target === 'VIP') {
        [tokenRows] = await pool.query(`
          SELECT pt.expo_token, pt.fcm_token
          FROM push_tokens pt
          JOIN orders o ON o.user_id = pt.user_id
          GROUP BY pt.user_id
          HAVING COUNT(o.id) >= 5
        `);
      }
    } catch (dbErr) {
      console.log("⚠️ Failed to fetch tokens:", dbErr.message);
      return;
    }

    const expoTokens = tokenRows.map((r) => r.expo_token).filter(Boolean);
    const fcmTokens = tokenRows.map((r) => r.fcm_token).filter(Boolean);

    if (expoTokens.length) {
      await sendExpoPush(expoTokens, n.title, n.body, { notificationId: n.id });
    }

    if (fcmTokens.length) {
      await sendFCMPush(fcmTokens, n.title, n.body, { notificationId: n.id });
    }

    if (expoTokens.length || fcmTokens.length) {
      try {
        await pool.query('UPDATE notifications SET sent = 1 WHERE id = ?', [
          n.id,
        ]);
        console.log(
          `📤 broadcast #${n.id} sent to ${expoTokens.length} Expo + ${fcmTokens.length} FCM devices`
        );
      } catch (dbErr) {
        console.log("⚠️ Failed to update notifications table:", dbErr.message);
      }
    } else {
      console.log(`ℹ️ No tokens found for broadcast #${n.id}`);
    }
  } catch (err) {
    console.log("⚠️ broadcastNotification failed:", err.message);
  }
}

module.exports = { sendExpoPush, sendFCMPush, broadcastNotification };
