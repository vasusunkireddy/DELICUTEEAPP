const express = require("express");
const pool = require("../db");
const nodemailer = require("nodemailer");
const admin = require("firebase-admin");
const router = express.Router();

// Validate environment variables
if (!process.env.EMAIL_USER || !process.env.EMAIL_PASS || !process.env.FIREBASE_SERVICE_ACCOUNT) {
  throw new Error("Missing required environment variables: EMAIL_USER, EMAIL_PASS, or FIREBASE_SERVICE_ACCOUNT");
}

// Initialize Nodemailer transporter
const transporter = nodemailer.createTransport({
  service: "gmail",
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS,
  },
});

// Initialize Firebase Admin SDK
if (!admin.apps.length) {
  try {
    admin.initializeApp({
      credential: admin.credential.cert(JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT)),
    });
  } catch (err) {
    throw new Error(`Failed to initialize Firebase: ${err.message}`);
  }
}

// Helper function to send admin email notification
async function sendAdminEmailNotification(orderId, userId, total, cartItems) {
  const itemList = cartItems
    .map((item) => `- ${item.name}: ₹${Number(item.price).toFixed(2)} x ${item.quantity}`)
    .join("\n");
  const payload = {
    to: "contactdelicute@gmail.com",
    subject: `New Order Placed: #${orderId}`,
    body: `A new order has been placed.\nOrder ID: #${orderId}\nUser ID: ${userId}\nTotal: ₹${Number(total).toFixed(2)}\nItems:\n${itemList}`,
  };

  try {
    await transporter.sendMail({
      from: `"Delicute App" <${process.env.EMAIL_USER}>`,
      to: payload.to,
      subject: payload.subject,
      text: payload.body,
    });
    console.log(`✅ Admin email notification sent for order: ${orderId}`);
  } catch (err) {
    console.error(`🔥 Failed to send admin email notification for order ${orderId}:`, err.message);
    throw err;
  }
}

// Helper function to send admin push notification
async function sendAdminPushNotification(orderId, userId, total) {
  const adminToken = process.env.ADMIN_DEVICE_TOKEN;
  if (!adminToken) {
    console.warn("🔧 Admin device token not found in environment variables");
    return;
  }

  const message = {
    notification: {
      title: "New Order Received",
      body: `Order #${orderId} for ₹${Number(total).toFixed(2)} has been placed by user ${userId}.`,
    },
    token: adminToken,
  };

  try {
    await admin.messaging().send(message);
    console.log(`✅ Admin push notification sent for order: ${orderId}`);
  } catch (err) {
    console.error(`🔥 Failed to send admin push notification for order ${orderId}:`, err.message);
    throw err;
  }
}

// POST /api/customer-orders
router.post("/customer-orders", async (req, res) => {
  const { userId, address, total, cartItems, payment, status, couponCode } = req.body;
  console.log("📡 POST /api/customer-orders", { userId, address, total, cartItems, payment, status, couponCode });

  if (!userId || !address || !total || total <= 0 || !cartItems || !Array.isArray(cartItems) || cartItems.length === 0 || !payment || !status) {
    return res.status(400).json({ error: "Missing or invalid fields (userId, address, total, cartItems, payment, status)" });
  }

  if (payment !== "COD") {
    return res.status(400).json({ error: "Only Cash on Delivery (COD) is supported" });
  }

  let conn;
  try {
    conn = await pool.getConnection();
    await conn.beginTransaction();

    const [orderResult] = await conn.query(
      `INSERT INTO orders (user_id, address, total, payment_method, payment_status, status, created_at)
       VALUES (?, ?, ?, ?, ?, ?, NOW())`,
      [userId, address, total, payment, "SUCCESS", status]
    );

    const orderId = orderResult.insertId;

    for (const item of cartItems) {
      if (!item.itemId || !item.name || !item.price || item.price <= 0 || !item.quantity || item.quantity <= 0) {
        throw new Error(`Invalid cart item: missing or invalid itemId, name, price, or quantity for item ${item.name}`);
      }
      await conn.query(
        `INSERT INTO order_items (order_id, menu_item_id, name, price, qty, image_url)
         SELECT ?, ?, ?, ?, ?, image_url FROM menu_items WHERE id = ?`,
        [orderId, item.itemId, item.name, item.price, item.quantity, item.itemId]
      );
    }

    await conn.commit();
    console.log("✅ Order created:", { orderId });

    // Trigger notifications (non-blocking)
    sendAdminEmailNotification(orderId, userId, total, cartItems).catch((err) =>
      console.error("🔥 Notification error (non-blocking):", err.message)
    );
    sendAdminPushNotification(orderId, userId, total).catch((err) =>
      console.error("🔥 Notification error (non-blocking):", err.message)
    );

    res.json({ success: true, orderId });
  } catch (err) {
    if (conn) await conn.rollback();
    console.error("🔥 CREATE ORDER ERROR:", err.message);
    res.status(500).json({ error: "Failed to create order", details: err.message });
  } finally {
    if (conn) conn.release();
  }
});

// POST /api/payments/create
router.post("/payments/create", async (req, res) => {
  const { orderId, customerId, method, amount } = req.body;
  console.log("📡 POST /api/payments/create", { orderId, customerId, method, amount });

  if (!orderId || !customerId || !method || !amount || amount <= 0) {
    return res.status(400).json({ error: "Missing or invalid fields (orderId, customerId, method, amount)" });
  }

  if (method !== "COD") {
    return res.status(400).json({ error: "Only Cash on Delivery (COD) is supported" });
  }

  let conn;
  try {
    conn = await pool.getConnection();
    await conn.beginTransaction();

    const [order] = await conn.query(`SELECT id FROM orders WHERE id = ? AND user_id = ?`, [orderId, customerId]);

    if (order.length === 0) {
      return res.status(404).json({ error: "Order not found or customer mismatch" });
    }

    const [result] = await conn.query(
      `INSERT INTO payments (orderId, customerId, method, amount, status, paidAt)
       VALUES (?, ?, ?, ?, ?, NOW())`,
      [orderId, customerId, method, amount, "SUCCESS"]
    );

    await conn.query(
      `UPDATE orders SET payment_status = ?, payment_method = ?, payment_id = ? WHERE id = ? AND user_id = ?`,
      ["SUCCESS", method, result.insertId, orderId, customerId]
    );

    await conn.commit();
    console.log("✅ Payment record created:", result.insertId);
    res.json({ success: true, paymentId: result.insertId, status: "SUCCESS", orderId });
  } catch (err) {
    if (conn) await conn.rollback();
    console.error("🔥 CREATE PAYMENT ERROR:", err.message);
    res.status(500).json({ error: "Failed to create payment", details: err.message });
  } finally {
    if (conn) conn.release();
  }
});

// POST /api/payments/cancel
router.post("/payments/cancel", async (req, res) => {
  const { orderId, customerId } = req.body;
  console.log("📡 POST /api/payments/cancel", { orderId, customerId });

  if (!orderId || !customerId) {
    return res.status(400).json({ error: "Missing orderId or customerId" });
  }

  let conn;
  try {
    conn = await pool.getConnection();
    await conn.beginTransaction();

    const [order] = await conn.query(`SELECT id FROM orders WHERE id = ? AND user_id = ?`, [orderId, customerId]);

    if (order.length === 0) {
      return res.status(404).json({ error: "Order not found or customer mismatch" });
    }

    const [paymentUpdate] = await conn.query(
      `UPDATE payments SET status = 'CANCELLED' WHERE orderId = ? AND customerId = ? AND status = 'PENDING'`,
      [orderId, customerId]
    );

    if (paymentUpdate.affectedRows === 0) {
      return res.status(404).json({ error: "Payment not found, not pending, or customer mismatch" });
    }

    await conn.query(
      `UPDATE orders SET payment_status = 'CANCELLED', status = 'Cancelled' WHERE id = ? AND user_id = ?`,
      [orderId, customerId]
    );

    await conn.commit();
    console.log("✅ Payment cancelled:", { orderId });
    res.json({ success: true, status: "CANCELLED" });
  } catch (err) {
    if (conn) await conn.rollback();
    console.error("🔥 CANCEL PAYMENT ERROR:", err.message);
    res.status(500).json({ error: "Failed to cancel payment", details: err.message });
  } finally {
    if (conn) conn.release();
  }
});

// POST /api/notifications/email
router.post("/notifications/email", async (req, res) => {
  const { to, subject, body } = req.body;
  console.log("📡 POST /api/notifications/email", { to, subject });

  if (!to || !subject || !body) {
    return res.status(400).json({ error: "Missing to, subject, or body" });
  }

  try {
    await transporter.sendMail({
      from: `"Delicute App" <${process.env.EMAIL_USER}>`,
      to,
      subject,
      text: body,
    });
    console.log("✅ Email sent to:", to);
    res.json({ success: true });
  } catch (err) {
    console.error("🔥 EMAIL SEND ERROR:", err.message);
    res.status(500).json({ error: "Failed to send email", details: err.message });
  }
});

// POST /api/notifications/push
router.post("/notifications/push", async (req, res) => {
  const { to, title, body } = req.body;
  console.log("📡 POST /api/notifications/push", { to, title });

  if (!to || !title || !body) {
    return res.status(400).json({ error: "Missing to, title, or body" });
  }

  const message = {
    notification: {
      title,
      body,
    },
    token: to,
  };

  try {
    await admin.messaging().send(message);
    console.log("✅ Push notification sent to:", to);
    res.json({ success: true });
  } catch (err) {
    console.error("🔥 PUSH NOTIFICATION ERROR:", err.message);
    res.status(500).json({ error: "Failed to send push notification", details: err.message });
  }
});

module.exports = router;