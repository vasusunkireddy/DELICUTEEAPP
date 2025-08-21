const express = require("express");
const pool = require("../db");
const nodemailer = require("nodemailer");
const dayjs = require("dayjs");

const router = express.Router();

// Payment method options
const PAYMENT_METHODS = {
  upi: [
    { name: "Paytm", vpa: "9652296548@pthdfc" },
    { name: "PhonePe", vpa: "Q952457548@ybl" },
    { name: "GPay", vpa: "svasudevareddy18604@oksbi" },
  ],
};

// Valid payment methods
const VALID_METHODS = ["UPI", "COD"];

// Configure Nodemailer
const transporter = nodemailer.createTransport({
  service: "gmail",
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS,
  },
});

// Simulated UPI verification (replace with real UPI provider API)
const verifyUPIPayment = async (orderUid, gatewayTxnId) => {
  if (gatewayTxnId && gatewayTxnId.endsWith("success")) {
    return { status: "SUCCESS", transactionId: gatewayTxnId };
  } else if (gatewayTxnId && gatewayTxnId.endsWith("failed")) {
    return { status: "FAILED", transactionId: gatewayTxnId };
  }
  return { status: "PENDING" };
};

// GET /api/payments/methods
router.get("/methods", (_req, res) => {
  res.json(PAYMENT_METHODS);
});

// GET /api/payments/status/:orderUid
router.get("/status/:orderUid", async (req, res) => {
  const { orderUid } = req.params;

  try {
    const [payments] = await pool.query(
      `SELECT status, gatewayTxnId
       FROM payments
       WHERE orderUid = ?`,
      [orderUid]
    );

    if (payments.length === 0) {
      return res.status(404).json({ error: "Payment not found" });
    }

    const payment = payments[0];

    if (payment.status !== "PENDING") {
      return res.json({ status: payment.status });
    }

    const verification = await verifyUPIPayment(orderUid, payment.gatewayTxnId);

    if (verification.status !== payment.status) {
      await pool.query(
        `UPDATE payments SET status = ?, gatewayTxnId = ? WHERE orderUid = ?`,
        [verification.status, verification.transactionId || payment.gatewayTxnId, orderUid]
      );

      const [order] = await pool.query(
        `SELECT id AS orderId, customer_name AS name, email, user_id AS customerId
         FROM orders
         WHERE orderUid = ?`,
        [orderUid]
      );

      if (order.length > 0) {
        const orderId = order[0].orderId;
        await pool.query(
          `UPDATE orders SET payment_status = ? WHERE id = ?`,
          [verification.status, orderId]
        );

        if (verification.status === "SUCCESS" && order[0].email) {
          const mailOptions = {
            from: `"Delicute" <${process.env.EMAIL_USER}>`,
            to: order[0].email,
            subject: "Delicute Payment Receipt",
            html: `
              <h2>Hi ${order[0].name || "Customer"},</h2>
              <p>Thank you for your order with <strong>Delicute</strong> 🎉</p>
              <p>Your payment has been confirmed successfully.</p>
              <p><strong>Order ID:</strong> ${orderUid}</p>
              <p><strong>Status:</strong> ${verification.status}</p>
            `,
          };
          await transporter.sendMail(mailOptions);
        }
      }
    }

    res.json({ status: verification.status });
  } catch (err) {
    console.error("🔥 GET PAYMENT STATUS ERROR:", err);
    res.status(500).json({ error: "Failed to fetch payment status" });
  }
});

// POST /api/payments/create
router.post("/create", async (req, res) => {
  const { orderId, orderUid, customerId, method, amount, gatewayTxnId, notes } = req.body;

  if (!orderId || !orderUid || !customerId || !method || !amount || amount <= 0) {
    return res.status(400).json({
      error: "Missing or invalid fields",
    });
  }

  if (!VALID_METHODS.includes(method)) {
    return res.status(400).json({ error: `Invalid payment method. Must be: ${VALID_METHODS.join(", ")}` });
  }

  try {
    // Insert into payments
    const [result] = await pool.query(
      `INSERT INTO payments (orderId, orderUid, customerId, method, amount, status, gatewayTxnId, notes, paidAt)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, NOW())`,
      [orderId, orderUid, customerId, method, amount, method === "COD" ? "SUCCESS" : "PENDING", gatewayTxnId || null, notes || null]
    );

    // Update order
    await pool.query(
      `UPDATE orders SET payment_status = ?, payment_method = ?, payment_id = ? WHERE id = ? AND user_id = ?`,
      [method === "COD" ? "SUCCESS" : "PENDING", method, result.insertId, orderId, customerId]
    );

    res.json({
      success: true,
      paymentId: result.insertId,
      status: method === "COD" ? "SUCCESS" : "PENDING",
      orderUid,
    });
  } catch (err) {
    console.error("🔥 CREATE PAYMENT ERROR:", err);
    res.status(500).json({ error: "Failed to create payment" });
  }
});

// POST /api/payments/verify
router.post("/verify", async (req, res) => {
  const { orderUid, customerId, method, success, gatewayTxnId } = req.body;

  if (!orderUid || !customerId || !method) {
    return res.status(400).json({ error: "Missing fields" });
  }

  const newStatus = success === true ? "SUCCESS" : "FAILED";

  try {
    const [paymentUpdate] = await pool.query(
      `UPDATE payments SET status = ?, gatewayTxnId = ? WHERE orderUid = ? AND customerId = ?`,
      [newStatus, gatewayTxnId || null, orderUid, customerId]
    );

    if (paymentUpdate.affectedRows === 0) {
      return res.status(404).json({ error: "Payment not found or customer mismatch" });
    }

    const [order] = await pool.query(
      `SELECT id AS orderId FROM orders WHERE orderUid = ? AND user_id = ?`,
      [orderUid, customerId]
    );

    if (order.length === 0) {
      return res.status(404).json({ error: "Order not found or customer mismatch" });
    }

    await pool.query(
      `UPDATE orders SET payment_status = ?, payment_method = ? WHERE id = ?`,
      [newStatus, method, order[0].orderId]
    );

    res.json({ success: true, status: newStatus });
  } catch (err) {
    console.error("🔥 VERIFY PAYMENT ERROR:", err);
    res.status(500).json({ error: "Payment verification failed" });
  }
});

// POST /api/payments/cancel
router.post("/cancel", async (req, res) => {
  const { orderUid, customerId } = req.body;

  if (!orderUid || !customerId) {
    return res.status(400).json({ error: "Missing orderUid or customerId" });
  }

  try {
    const [paymentUpdate] = await pool.query(
      `UPDATE payments SET status = 'CANCELLED' WHERE orderUid = ? AND customerId = ? AND status = 'PENDING'`,
      [orderUid, customerId]
    );

    if (paymentUpdate.affectedRows === 0) {
      return res.status(404).json({ error: "Payment not found, not pending, or customer mismatch" });
    }

    await pool.query(
      `UPDATE orders SET payment_status = 'CANCELLED' WHERE orderUid = ? AND user_id = ?`,
      [orderUid, customerId]
    );

    res.json({ success: true, status: "CANCELLED" });
  } catch (err) {
    console.error("🔥 CANCEL PAYMENT ERROR:", err);
    res.status(500).json({ error: "Failed to cancel payment" });
  }
});

module.exports = router;
