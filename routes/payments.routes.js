const express = require("express");
const pool = require("../db");
const nodemailer = require("nodemailer");
const admin = require("firebase-admin");
const router = express.Router();

// Initialize Nodemailer transporter
const transporter = nodemailer.createTransport({
  service: "gmail",
  auth: {
    user: process.env.EMAIL_USER || "contactdelicute@gmail.com",
    pass: process.env.EMAIL_PASS,
  },
});

// Initialize Firebase Admin SDK
if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.cert(JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT)),
  });
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

  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();

    const [orderResult] = await conn.query(
      `INSERT INTO orders (user_id, address, total, payment_method, payment_status, status, created_at)
       VALUES (?, ?, ?, ?, ?, ?, NOW())`,
      [userId, address, total, payment, payment === "COD" ? "SUCCESS" : "PENDING", status]
    );

    const orderId = orderResult.insertId;

    for (const item of cartItems) {
      if (!item.itemId || !item.name || !item.price || item.price <= 0 || !item.quantity || item.quantity <= 0) {
        throw new Error("Invalid cart item: missing or invalid itemId, name, price, or quantity");
      }
      await conn.query(
        `INSERT INTO order_items (order_id, menu_item_id, name, price, qty, image_url)
         SELECT ?, ?, ?, ?, ?, image_url FROM menu_items WHERE id = ?`,
        [orderId, item.itemId, item.name, item.price, item.quantity, item.itemId]
      );
    }

    await conn.commit();
    console.log("✅ Order created:", { orderId });

    // Trigger notifications after successful order
    try {
      await Promise.all([
        sendAdminEmailNotification(orderId, userId, total, cartItems),
        sendAdminPushNotification(orderId, userId, total),
      ]);
    } catch (notificationErr) {
      console.error("🔥 Notification error (non-blocking):", notificationErr.message);
    }

    res.json({ success: true, orderId });
  } catch (err) {
    await conn.rollback();
    console.error("🔥 CREATE ORDER ERROR:", err.message);
    res.status(500).json({ error: "Failed to create order" });
  } finally {
    conn.release();
  }
});

// POST /api/payments/create
router.post("/payments/create", async (req, res) => {
  const { orderId, customerId, method, amount } = req.body;
  console.log("📡 POST /api/payments/create", { orderId, customerId, method, amount });

  if (!orderId || !customerId || !method || !amount || amount <= 0) {
    return res.status(400).json({
      error: "Missing or invalid fields (orderId, customerId, method, amount)",
    });
  }

  if (method !== "COD") {
    return res.status(400).json({ error: "Only Cash on Delivery (COD) is supported" });
  }

  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();

    const [order] = await conn.query(
      `SELECT id FROM orders WHERE id = ? AND user_id = ?`,
      [orderId, customerId]
    );

    if (order.length === 0) {
      throw new Error("Order not found or customer mismatch");
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
    res.json({
      success: true,
      paymentId: result.insertId,
      status: "SUCCESS",
      orderId,
    });
  } catch (err) {
    await conn.rollback();
    console.error("🔥 CREATE PAYMENT ERROR:", err.message);
    res.status(500).json({ error: "Failed to create payment" });
  } finally {
    conn.release();
  }
});

// POST /api/payments/cancel
router.post("/payments/cancel", async (req, res) => {
  const { orderId, customerId } = req.body;
  console.log("📡 POST /api/payments/cancel", { orderId, customerId });

  if (!orderId || !customerId) {
    return res.status(400).json({ error: "Missing orderId or customerId" });
  }

  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();

    const [order] = await conn.query(
      `SELECT id FROM orders WHERE id = ? AND user_id = ?`,
      [orderId, customerId]
    );

    if (order.length === 0) {
      throw new Error("Order not found or customer mismatch");
    }

    const [paymentUpdate] = await conn.query(
      `UPDATE payments SET status = 'CANCELLED' WHERE orderId = ? AND customerId = ? AND status = 'PENDING'`,
      [orderId, customerId]
    );

    if (paymentUpdate.affectedRows === 0) {
      throw new Error("Payment not found, not pending, or customer mismatch");
    }

    await conn.query(
      `UPDATE orders SET payment_status = 'CANCELLED', status = 'Cancelled' WHERE id = ? AND user_id = ?`,
      [orderId, customerId]
    );

    await conn.commit();
    console.log("✅ Payment cancelled:", { orderId });
    res.json({ success: true, status: "CANCELLED" });
  } catch (err) {
    await conn.rollback();
    console.error("🔥 CANCEL PAYMENT ERROR:", err.message);
    res.status(500).json({ error: "Failed to cancel payment" });
  } finally {
    conn.release();
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
      from: `"Delicute App" <${process.env.EMAIL_USER || "contactdelicute@gmail.com"}>`,
      to,
      subject,
      text: body,
    });
    console.log("✅ Email sent to:", to);
    res.json({ success: true });
  } catch (err) {
    console.error("🔥 EMAIL SEND ERROR:", err.message);
    res.status(500).json({ error: "Failed to send email" });
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
    token: to, // Admin's device token
  };

  try {
    await admin.messaging().send(message);
    console.log("✅ Push notification sent to:", to);
    res.json({ success: true });
  } catch (err) {
    console.error("🔥 PUSH NOTIFICATION ERROR:", err.message);
    res.status(500).json({ error: "Failed to send push notification" });
  }
});

// Helper function to send admin email notification
async function sendAdminEmailNotification(orderId, userId, total, cartItems) {
  const payload = {
    to: "contactdelicute@gmail.com",
    subject: `New Order Placed: #${orderId}`,
    body: `A new order has been placed.\nOrder ID: ${orderId}\nUser ID: ${userId}\nTotal: ₹${total.toFixed(2)}\nItems:\n${cartItems
      .map((item) => `- ${item.name}: ₹${item.price} x ${item.quantity}`)
      .join("\n")}`,
  };
  try {
    await transporter.sendMail({
      from: `"Delicute App" <${process.env.EMAIL_USER || "contactdelicute@gmail.com"}>`,
      to: payload.to,
      subject: payload.subject,
      text: payload.body,
    });
    console.log("✅ Admin email notification sent for order:", orderId);
  } catch (err) {
    console.error("🔥 Failed to send admin email notification:", err.message);
    throw err;
  }
}

// Helper function to send admin push notification
async function sendAdminPushNotification(orderId, userId, total) {
  const message = {
    notification: {
      title: "New Order Received",
      body: `Order #${orderId} for ₹${total.toFixed(2)} has been placed by user ${userId}.`,
    },
    token: process.env.ADMIN_DEVICE_TOKEN || "admin_device_token", // Use environment variable
  };

  try {
    await admin.messaging().send(message);
    console.log("✅ Admin push notification sent for order:", orderId);
  } catch (err) {
    console.error("🔥 Failed to send admin push notification:", err.message);
    throw err;
  }
}

module.exports = router;