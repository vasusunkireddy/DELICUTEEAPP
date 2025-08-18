const express = require("express");
const pool = require("../db");
const nodemailer = require("nodemailer");
const dayjs = require("dayjs");

const router = express.Router();

// Payment method options (aligned with schema's method enum)
const PAYMENT_METHODS = {
  upi: [
    { name: "Paytm", vpa: "9652296548@pthdfc" },
    { name: "PhonePe", vpa: "9652296548@ybl" },
    { name: "GPay", vpa: "svasudevareddy18694@oksbi" },
  ],
  card: ["Visa", "MasterCard", "Rupay"],
  wallet: ["Mobikwik Wallet"],
  cod: ["COD"],
};

// Valid payment methods for validation
const VALID_METHODS = ["COD", "UPI", "CARD", "WALLET"];

// Configure Nodemailer
const transporter = nodemailer.createTransport({
  service: "gmail",
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS,
  },
});

// GET /api/payments/methods
router.get("/methods", (_req, res) => {
  console.log("Handling GET /api/payments/methods");
  res.json(PAYMENT_METHODS);
});

// GET /api/payments?from={date}&to={date}
router.get("/", async (req, res) => {
  const { from, to } = req.query;
  console.log("➡️ /api/payments request:", { from, to });

  if (!from || !to || !dayjs(from).isValid() || !dayjs(to).isValid()) {
    return res.status(400).json({ error: "Invalid or missing from/to dates" });
  }

  try {
    const [rows] = await pool.query(
      `SELECT id, orderId, customerId, method, amount, status
       FROM payments
       WHERE paidAt BETWEEN ? AND DATE_ADD(?, INTERVAL 1 DAY)`,
      [from, to]
    );

    console.log(`✅ Fetched ${rows.length} payments`);
    res.json(rows);
  } catch (err) {
    console.error("🔥 GET PAYMENTS ERROR:", err);
    res.status(500).json({ error: "Failed to fetch payments" });
  }
});

// GET /api/payments/summary?from={date}&to={date}
router.get("/summary", async (req, res) => {
  const { from, to } = req.query;
  console.log("➡️ /api/payments/summary request:", { from, to });

  if (!from || !to || !dayjs(from).isValid() || !dayjs(to).isValid()) {
    return res.status(400).json({ error: "Invalid or missing from/to dates" });
  }

  try {
    const [rows] = await pool.query(
      `SELECT method, SUM(amount) AS total, COUNT(*) AS txns
       FROM payments
       WHERE paidAt BETWEEN ? AND DATE_ADD(?, INTERVAL 1 DAY)
       GROUP BY method`,
      [from, to]
    );

    // Convert total to number to fix frontend error
    const formattedRows = rows.map(row => ({
      method: row.method,
      total: parseFloat(row.total), // Convert DECIMAL string to number
      txns: parseInt(row.txns, 10), // Ensure txns is an integer
    }));

    console.log(`✅ Fetched summary for ${rows.length} methods`);
    res.json(formattedRows);
  } catch (err) {
    console.error("🔥 GET SUMMARY ERROR:", err);
    res.status(500).json({ error: "Failed to fetch payment summary" });
  }
});

// POST /api/payments/create
router.post("/create", async (req, res) => {
  const { orderId, customerId, method, amount, gatewayTxnId, notes } = req.body;
  console.log("➡️ /api/payments/create request:", { orderId, customerId, method, amount, gatewayTxnId, notes });

  if (!orderId || !customerId || !method || !amount || amount <= 0) {
    return res.status(400).json({
      error: "Missing or invalid fields (orderId, customerId, method, amount)",
    });
  }

  if (!VALID_METHODS.includes(method)) {
    return res.status(400).json({ error: `Invalid payment method. Must be one of: ${VALID_METHODS.join(", ")}` });
  }

  const initialStatus = method === "COD" ? "SUCCESS" : "PENDING";

  try {
    const [result] = await pool.query(
      `INSERT INTO payments (orderId, customerId, method, amount, status, gatewayTxnId, notes, paidAt)
       VALUES (?, ?, ?, ?, ?, ?, ?, NOW())`,
      [orderId, customerId, method, amount, initialStatus, gatewayTxnId || null, notes || null]
    );

    await pool.query(
      `UPDATE orders SET payment_status = ?, payment_method = ?, payment_id = ? WHERE id = ? AND user_id = ?`,
      [initialStatus, method, result.insertId, orderId, customerId]
    );

    console.log("✅ Payment record created:", result.insertId);
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
  const { orderId, customerId, method, success, gatewayTxnId } = req.body;
  console.log("➡️ /api/payments/verify request:", { orderId, customerId, method, success, gatewayTxnId });

  if (!orderId || !customerId || !method) {
    return res.status(400).json({ error: "Missing orderId, customerId, or method" });
  }

  if (!VALID_METHODS.includes(method)) {
    return res.status(400).json({ error: `Invalid payment method. Must be one of: ${VALID_METHODS.join(", ")}` });
  }

  const newStatus = method === "COD" ? "SUCCESS" : success === true ? "SUCCESS" : "FAILED";

  try {
    const [paymentUpdate] = await pool.query(
      `UPDATE payments SET status = ?, gatewayTxnId = ? WHERE orderId = ? AND customerId = ?`,
      [newStatus, gatewayTxnId || null, orderId, customerId]
    );

    if (paymentUpdate.affectedRows === 0) {
      return res.status(404).json({ error: "Payment not found or customer mismatch" });
    }

    const [orderUpdate] = await pool.query(
      `UPDATE orders SET payment_status = ?, payment_method = ? WHERE id = ? AND user_id = ?`,
      [newStatus, method, orderId, customerId]
    );

    if (orderUpdate.affectedRows === 0) {
      return res.status(404).json({ error: "Order not found or customer mismatch" });
    }

    if (newStatus === "SUCCESS") {
      const [order] = await pool.query(
        `SELECT customer_name AS name, email
         FROM orders
         WHERE id = ? AND user_id = ?`,
        [orderId, customerId]
      );

      if (order.length > 0 && order[0].email) {
        const customerEmail = order[0].email;
        const customerName = order[0].name || "Customer";

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
      } else {
        console.warn("⚠️ No customer email found for order:", orderId);
      }
    }

    console.log("✅ Payment verified:", { orderId, newStatus });
    res.json({ success: true, status: newStatus });
  } catch (err) {
    console.error("🔥 VERIFY ERROR:", err);
    res.status(500).json({ error: "Payment verification failed" });
  }
});

// POST /api/payments/refund
router.post("/refund", async (req, res) => {
  const { orderId, customerId, refundAmount, refundId, notes } = req.body;
  console.log("➡️ /api/payments/refund request:", { orderId, customerId, refundAmount, refundId, notes });

  if (!orderId || !customerId || !refundAmount || refundAmount <= 0) {
    return res.status(400).json({
      error: "Missing or invalid fields (orderId, customerId, refundAmount)",
    });
  }

  try {
    const [payment] = await pool.query(
      `SELECT amount FROM payments WHERE orderId = ? AND customerId = ? AND status = 'SUCCESS'`,
      [orderId, customerId]
    );

    if (payment.length === 0) {
      return res.status(404).json({ error: "No successful payment found for this order" });
    }

    if (refundAmount > payment[0].amount) {
      return res.status(400).json({ error: "Refund amount exceeds payment amount" });
    }

    const [result] = await pool.query(
      `UPDATE payments
       SET status = 'REFUNDED', refundId = ?, refundAmount = ?, refundAt = NOW(), notes = ?
       WHERE orderId = ? AND customerId = ?`,
      [refundId || null, refundAmount, notes || null, orderId, customerId]
    );

    if (result.affectedRows === 0) {
      return res.status(404).json({ error: "Payment not found or already refunded" });
    }

    await pool.query(
      `UPDATE orders SET payment_status = 'REFUNDED' WHERE id = ? AND user_id = ?`,
      [orderId, customerId]
    );

    console.log("✅ Refund processed:", { orderId, refundAmount });
    res.json({ success: true, status: "REFUNDED" });
  } catch (err) {
    console.error("🔥 REFUND ERROR:", err);
    res.status(500).json({ error: "Failed to process refund" });
  }
});

module.exports = router;