const express = require("express");
const pool = require("../db");
const nodemailer = require("nodemailer");

const router = express.Router();

// Payment methods
const PAYMENT_METHODS = {
  upi: [
    { name: "Paytm", vpa: "9652296548@pthdfc" },
    { name: "PhonePe", vpa: "Q952457548@ybl" },
    { name: "GPay", vpa: "svasudevareddy18604@oksbi" },
  ],
};

const VALID_METHODS = ["UPI", "COD"];

// Nodemailer
const transporter = nodemailer.createTransport({
  service: "gmail",
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS,
  },
});

// Simulated UPI verification
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
    const [orderRows] = await pool.query(
      "SELECT id, payment_status, customer_name AS name, email FROM orders WHERE orderUid = ?",
      [orderUid]
    );
    if (orderRows.length === 0) {
      return res.status(404).json({ error: "Order not found" });
    }
    const order = orderRows[0];

    const [payments] = await pool.query(
      "SELECT * FROM payments WHERE orderUid = ?",
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
        "UPDATE payments SET status = ?, gatewayTxnId = ? WHERE orderUid = ?",
        [verification.status, verification.transactionId || payment.gatewayTxnId, orderUid]
      );
      await pool.query(
        "UPDATE orders SET payment_status = ? WHERE id = ?",
        [verification.status, order.id]
      );

      if (verification.status === "SUCCESS" && order.email) {
        await transporter.sendMail({
          from: `"Delicute" <${process.env.EMAIL_USER}>`,
          to: order.email,
          subject: "Delicute Payment Receipt",
          html: `
            <h2>Hi ${order.name || "Customer"},</h2>
            <p>Your payment for order ${orderUid} is confirmed ✅</p>
            <p>Status: ${verification.status}</p>
          `,
        });
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
  const { orderUid, customerId, method, amount, gatewayTxnId, notes } = req.body;

  if (!orderUid || !customerId || !method || !amount || amount <= 0) {
    return res.status(400).json({ error: "Missing or invalid fields" });
  }
  if (!VALID_METHODS.includes(method)) {
    return res.status(400).json({ error: `Invalid payment method. Must be: ${VALID_METHODS.join(", ")}` });
  }

  try {
    const [orderRows] = await pool.query(
      "SELECT id FROM orders WHERE orderUid = ? AND user_id = ?",
      [orderUid, customerId]
    );
    if (orderRows.length === 0) {
      return res.status(404).json({ error: "Order not found" });
    }
    const orderId = orderRows[0].id;

    const [result] = await pool.query(
      `INSERT INTO payments 
       (orderId, orderUid, customerId, method, amount, status, gatewayTxnId, notes, paidAt)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, NOW())`,
      [orderId, orderUid, customerId, method, amount, method === "COD" ? "SUCCESS" : "PENDING", gatewayTxnId || null, notes || null]
    );

    await pool.query(
      `UPDATE orders SET payment_status = ?, payment_method = ?, payment_id = ? WHERE id = ?`,
      [method === "COD" ? "SUCCESS" : "PENDING", method, result.insertId, orderId]
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

  try {
    const [orderRows] = await pool.query(
      "SELECT id, email, customer_name AS name FROM orders WHERE orderUid = ? AND user_id = ?",
      [orderUid, customerId]
    );
    if (orderRows.length === 0) {
      return res.status(404).json({ error: "Order not found" });
    }
    const orderId = orderRows[0].id;
    const order = orderRows[0];

    const newStatus = success ? "SUCCESS" : "FAILED";

    const [paymentUpdate] = await pool.query(
      "UPDATE payments SET status = ?, gatewayTxnId = ? WHERE orderUid = ? AND customerId = ?",
      [newStatus, gatewayTxnId || null, orderUid, customerId]
    );

    if (paymentUpdate.affectedRows === 0) {
      return res.status(404).json({ error: "Payment not found" });
    }

    await pool.query(
      "UPDATE orders SET payment_status = ?, payment_method = ? WHERE id = ? AND user_id = ?",
      [newStatus, method, orderId, customerId]
    );

    if (newStatus === "SUCCESS" && order.email) {
      await transporter.sendMail({
        from: `"Delicute" <${process.env.EMAIL_USER}>`,
        to: order.email,
        subject: "Delicute Payment Receipt",
        html: `
          <h2>Hi ${order.name || "Customer"},</h2>
          <p>Your payment for order ${orderUid} is confirmed ✅</p>
          <p>Status: ${newStatus}</p>
        `,
      });
    }

    res.json({ success: true, status: newStatus });
  } catch (err) {
    console.error("🔥 VERIFY ERROR:", err);
    res.status(500).json({ error: "Payment verification failed" });
  }
});

// POST /api/payments/cancel
router.post("/cancel", async (req, res) => {
  const { orderUid, customerId } = req.body;

  if (!orderUid || !customerId) {
    return res.status(400).json({ error: "Missing fields" });
  }

  try {
    const [orderRows] = await pool.query(
      "SELECT id FROM orders WHERE orderUid = ? AND user_id = ?",
      [orderUid, customerId]
    );
    if (orderRows.length === 0) return res.status(404).json({ error: "Order not found" });

    const orderId = orderRows[0].id;

    const [paymentUpdate] = await pool.query(
      "UPDATE payments SET status = 'CANCELLED' WHERE orderUid = ? AND customerId = ? AND status = 'PENDING'",
      [orderUid, customerId]
    );
    if (paymentUpdate.affectedRows === 0) {
      return res.status(404).json({ error: "Payment not pending or not found" });
    }

    await pool.query(
      "UPDATE orders SET payment_status = 'CANCELLED' WHERE id = ?",
      [orderId]
    );

    res.json({ success: true, status: "CANCELLED" });
  } catch (err) {
    console.error("🔥 CANCEL PAYMENT ERROR:", err);
    res.status(500).json({ error: "Failed to cancel payment" });
  }
});

module.exports = router;