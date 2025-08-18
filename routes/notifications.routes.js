// routes/notifications.routes.js
const express = require("express");
const router = express.Router();
const pool = require("../db");
const admin = require("firebase-admin");
const jwt = require("jsonwebtoken");
const multer = require("multer");
const cloudinary = require("cloudinary").v2;

/* ─── Firebase Admin ─── */
if (!admin.apps.length) {
  const serviceAccount = require("../firebase-service-account.json");
  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount),
  });
}

/* ─── Cloudinary ─── */
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});
const UPLOAD_FOLDER = process.env.CLOUDINARY_UPLOAD_FOLDER || "delicute/notifications";

/* ─── Multer (memory) ─── */
const upload = multer({ storage: multer.memoryStorage() });

/* ─── JWT Auth Middleware ─── */
const JWT_SECRET =
  process.env.JWT_SECRET ||
  "7f1ac914602d012f7147b4f39701f729fa042f4067f7b976efb0a8bfb3e6be34";

function authenticateToken(req, res, next) {
  let token = null;

  // Header: Authorization: Bearer <token>
  const authHeader = req.headers["authorization"];
  if (authHeader && authHeader.startsWith("Bearer ")) {
    token = authHeader.split(" ")[1];
  }

  // Cookie fallback
  if (!token && req.cookies?.token) {
    token = req.cookies.token;
  }

  if (!token) {
    return res.status(401).json({ message: "Unauthorized: No token provided" });
  }

  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    req.user = decoded;
    next();
  } catch (err) {
    console.error("JWT verify error:", err.message);
    return res.status(401).json({ message: "Unauthorized: Invalid token" });
  }
}

/* ─── Helpers ─── */
const validateNotification = ({ title, message }) => {
  if (!title?.trim() || !message?.trim()) return "Title and message are required";
  return null;
};
const chunk = (arr, size) => {
  const out = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
};

/* ─── Routes ─── */
router.use(authenticateToken);

// Save push token
router.post("/push-tokens", async (req, res, next) => {
  try {
    const { fcm_token } = req.body;
    if (!fcm_token) return res.status(400).json({ message: "Invalid FCM token" });

    await pool.query(
      `INSERT INTO push_tokens (user_id, fcm_token)
       VALUES (?, ?)
       ON DUPLICATE KEY UPDATE fcm_token = VALUES(fcm_token)`,
      [req.user.id, fcm_token]
    );

    res.json({ message: "Push token saved" });
  } catch (e) {
    next(e);
  }
});

// Upload image
router.post("/uploads/notification-image", upload.single("file"), (req, res, next) => {
  if (!req.file) return res.status(400).json({ message: "No file uploaded" });

  const uploadStream = cloudinary.uploader.upload_stream(
    {
      folder: UPLOAD_FOLDER,
      resource_type: "image",
    },
    (err, result) => {
      if (err) return next(err);
      res.json({ url: result.secure_url });
    }
  );

  uploadStream.end(req.file.buffer);
});

// Send notification
router.post("/notifications", async (req, res, next) => {
  try {
    const { title, message, imageUrl = null } = req.body;
    const error = validateNotification({ title, message });
    if (error) return res.status(400).json({ message: error });

    // Save to DB
    const [result] = await pool.query(
      `INSERT INTO notifications (title, message, imageUrl, createdAt, sent)
       VALUES (?, ?, ?, NOW(), 0)`,
      [title.trim(), message.trim(), imageUrl]
    );

    // Fetch push tokens
    const [rows] = await pool.query("SELECT fcm_token FROM push_tokens");
    const tokens = rows.map((r) => r.fcm_token).filter(Boolean);

    let success = 0,
      fail = 0;

    if (tokens.length) {
      const batches = chunk(tokens, 500);
      for (const batch of batches) {
        const msg = {
          notification: { title: title.trim(), body: message.trim(), ...(imageUrl ? { imageUrl } : {}) },
          android: { notification: { ...(imageUrl ? { imageUrl } : {}), priority: "HIGH" } },
          tokens: batch,
        };

        const resp = await admin.messaging().sendMulticast(msg);
        success += resp.successCount;
        fail += resp.failureCount;
      }

      if (success > 0) {
        await pool.query("UPDATE notifications SET sent = 1 WHERE id = ?", [result.insertId]);
      }
    }

    res.status(201).json({
      id: result.insertId,
      message: `Notification saved. Sent: ${success}, Failed: ${fail}`,
    });
  } catch (e) {
    next(e);
  }
});

// List notifications
router.get("/notifications", async (_req, res, next) => {
  try {
    const [rows] = await pool.query(
      "SELECT id, title, message, imageUrl, createdAt, sent FROM notifications ORDER BY id DESC"
    );
    res.json(rows);
  } catch (e) {
    next(e);
  }
});

// Delete notification
router.delete("/notifications/:id", async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    if (!id) return res.status(400).json({ message: "Invalid notification ID" });

    const [result] = await pool.query("DELETE FROM notifications WHERE id = ?", [id]);
    if (!result.affectedRows) return res.status(404).json({ message: "Notification not found" });

    res.json({ message: "Deleted" });
  } catch (e) {
    next(e);
  }
});

// Error handler
router.use((err, req, res, _next) => {
  console.error("Notifications error:", err);
  res.status(500).json({ message: "Failed to process request" });
});

module.exports = router;
