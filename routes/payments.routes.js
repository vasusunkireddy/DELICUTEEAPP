// routes/payments.routes.js
const express = require("express");
const pool = require("../db");
const nodemailer = require("nodemailer");

const router = express.Router();

// Payment method options
const PAYMENT_METHODS = {
  upi: [
    { name: "Paytm", vpa: "9652296548@pthdfc" },
    { name: "PhonePe", vpa: "9652296548@ybl" },
    { name: "GPay", vpa: "svasudevareddy18694@oksbi" },
  ],
  wallets: ["Mobikwik Wallet"],
  payLater: ["Simpl"],
  cod: ["COD"],
};

// ===== Configure Nodemailer =====
const transporter = nodemailer.createTransport({
  service: "gmail", // you can use SendGrid, Outlook, etc.
  auth: {
    user: process.env.EMAIL_USER, // set in .env
    pass: process.env.EMAIL_PASS, // app password if Gmail
  },
});

// GET /api/payments/methods
router.get("/methods", (_req, res) => {
  console.log("Handling GET /api/payments/methods");
  res.json(PAYMENT_METHODS);
});

// POST /api/payments/create
router.post("/create", async (req, res) => {
  const { orderId, userId, method, amount } = req.body;
  console.log("➡️ /api/payments/create request:", {
    orderId,
    userId,
    method,
    amount,
  });

  if (!orderId || !userId || !method || !amount) {
    return res
      .status(400)
      .json({ error: "Missing required fields (orderId, userId, method, amount)" });
  }

  const initialStatus = method === "COD" ? "Confirmed" : "Pending";

  try {
    const [result] = await pool.query(
      `INSERT INTO payments (order_id, user_id, method, amount, status, created_at)
       VALUES (?, ?, ?, ?, ?, NOW())`,
      [orderId, userId, method, amount, initialStatus]
    );

    console.log("✅ Payment record created:", result.insertId);

    await pool.query(
      `UPDATE orders SET status = ? WHERE id = ? AND user_id = ?`,
      [initialStatus, orderId, userId]
    );

    res.json({
      success: true,
      paymentId: result.insertId,
      status: initialStatus,
    });
  } catch (err) {
    console.error("🔥 CREATE PAYMENT ERROR:", err);
    res.status(500).json({ error: "Failed to create payment" });
  }
});

// POST /api/payments/verify
router.post("/verify", async (req, res) => {
  const { orderId, userId, method, success } = req.body;
  console.log("➡️ /api/payments/verify request:", {
    orderId,
    userId,
    method,
    success,
  });

  if (!orderId || !userId || !method) {
    return res
      .status(400)
      .json({ error: "Missing orderId, userId or method" });
  }

  const newStatus =
    method === "COD" ? "Confirmed" : success === true ? "Confirmed" : "Failed";

  try {
    // Update payments table
    await pool.query(
      `UPDATE payments SET status = ? WHERE order_id = ? AND user_id = ?`,
      [newStatus, orderId, userId]
    );

    // Update orders table
    await pool.query(
      `UPDATE orders SET status = ? WHERE id = ? AND user_id = ?`,
      [newStatus, orderId, userId]
    );

    console.log("✅ Payment verified:", { orderId, newStatus });

    // ===== Fetch user email for receipt =====
    const [user] = await pool.query(
      `SELECT email, name FROM users WHERE id = ?`,
      [userId]
    );

    if (user.length > 0 && newStatus === "Confirmed") {
      const customerEmail = user[0].email;
      const customerName = user[0].name || "Customer";

      const mailOptions = {
        from: `"Delicute" <${process.env.EMAIL_USER}>`,
        to: customerEmail,
        subject: "Delicute Payment Receipt",
        html: `
          <h2>Hi ${customerName},</h2>
          <p>Thank you for your order with <strong>Delicute</strong> 🎉</p>
          <p>Your payment has been confirmed successfully.</p>
          <p><strong>Order ID:</strong> ${orderId}</p>
          <p><strong>Payment Method:</strong> ${method}</p>
          <p><strong>Status:</strong> ${newStatus}</p>
          <br/>
          <p>We’re preparing your order and will notify you once it’s ready!</p>
          <p style="color:gray;font-size:12px;">Powered by Delicute</p>
        `,
      };

      await transporter.sendMail(mailOptions);
      console.log("📧 Email sent to customer:", customerEmail);
    }

    res.json({ success: true, status: newStatus });
  } catch (err) {
    console.error("🔥 VERIFY ERROR:", err);
    res.status(500).json({ error: "Payment verification failed" });
  }
});

module.exports = router;
