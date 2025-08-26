const express = require("express");
const pool = require("../db");
const router = express.Router();
const axios = require("axios"); // For PhonePe API calls (simulated)

// Simulated PhonePe API for transaction verification (replace with actual PhonePe API in production)
const verifyPhonePeTransaction = async (transactionId) => {
  // In production, make an API call to PhonePe's transaction verification endpoint
  // Example: https://api.phonepe.com/merchant/transactions/{transactionId}
  // This is a placeholder; actual implementation requires PhonePe merchant credentials
  try {
    // Simulated response (replace with actual API call)
    const response = {
      success: true,
      data: {
        transactionId,
        status: ["SUCCESS", "FAILED", "CANCELLED"][Math.floor(Math.random() * 3)], // Random for simulation
        amount: 75, // Example amount, should match order total
      },
    };
    return response;
  } catch (error) {
    console.error("🔥 PhonePe API Error:", error.message);
    throw new Error("Failed to verify transaction with PhonePe");
  }
};

// POST /api/customer-orders
router.post("/customer-orders", async (req, res) => {
  const { userId, address, total, cartItems, payment, status, couponCode, transactionId } = req.body;
  console.log("📡 POST /api/customer-orders", { userId, address, total, cartItems, payment, status, couponCode, transactionId });

  if (!userId || !address || !total || total <= 0 || !cartItems || !Array.isArray(cartItems) || cartItems.length === 0 || !payment || !status) {
    return res.status(400).json({ error: "Missing or invalid fields (userId, address, total, cartItems, payment, status)" });
  }

  if (payment !== "COD" && payment !== "UPI") {
    return res.status(400).json({ error: "Only Cash on Delivery (COD) and UPI are supported" });
  }

  if (payment === "UPI" && !transactionId) {
    return res.status(400).json({ error: "Transaction ID is required for UPI payments" });
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
router.post("/create", async (req, res) => {
  const { orderId, customerId, method, amount, transactionId } = req.body;
  console.log("📡 POST /api/payments/create", { orderId, customerId, method, amount, transactionId });

  if (!orderId || !customerId || !method || !amount || amount <= 0) {
    return res.status(400).json({
      error: "Missing or invalid fields (orderId, customerId, method, amount)",
    });
  }

  if (method !== "COD" && method !== "UPI") {
    return res.status(400).json({ error: "Only Cash on Delivery (COD) and UPI are supported" });
  }

  if (method === "UPI" && !transactionId) {
    return res.status(400).json({ error: "Transaction ID is required for UPI payments" });
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
      `INSERT INTO payments (orderId, customerId, method, amount, transaction_id, status, paidAt)
       VALUES (?, ?, ?, ?, ?, ?, NOW())`,
      [orderId, customerId, method, amount, transactionId || null, method === "COD" ? "SUCCESS" : "PENDING"]
    );

    await conn.query(
      `UPDATE orders SET payment_status = ?, payment_method = ?, payment_id = ? WHERE id = ? AND user_id = ?`,
      [method === "COD" ? "SUCCESS" : "PENDING", method, result.insertId, orderId, customerId]
    );

    await conn.commit();
    console.log("✅ Payment record created:", result.insertId);
    res.json({
      success: true,
      paymentId: result.insertId,
      status: method === "COD" ? "SUCCESS" : "PENDING",
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

// POST /api/payments/verify
router.post("/verify", async (req, res) => {
  const { orderId, customerId, transactionId, status } = req.body;
  console.log("📡 POST /api/payments/verify", { orderId, customerId, transactionId, status });

  if (!orderId || !customerId || !transactionId || !status) {
    return res.status(400).json({ error: "Missing fields (orderId, customerId, transactionId, status)" });
  }

  if (!["SUCCESS", "FAILED", "CANCELLED"].includes(status)) {
    return res.status(400).json({ error: "Invalid status. Must be SUCCESS, FAILED, or CANCELLED" });
  }

  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();

    const [order] = await conn.query(
      `SELECT id, total, payment_status FROM orders WHERE id = ? AND user_id = ?`,
      [orderId, customerId]
    );

    if (order.length === 0) {
      throw new Error("Order not found or customer mismatch");
    }

    if (order[0].payment_status !== "PENDING") {
      throw new Error("Order payment is not in PENDING status");
    }

    const [payment] = await conn.query(
      `SELECT id, amount FROM payments WHERE orderId = ? AND customerId = ? AND transaction_id = ? AND status = 'PENDING'`,
      [orderId, customerId, transactionId]
    );

    if (payment.length === 0) {
      throw new Error("Pending payment not found for this transaction");
    }

    // Verify transaction with PhonePe (simulated)
    const phonePeResponse = await verifyPhonePeTransaction(transactionId);

    if (!phonePeResponse.success || phonePeResponse.data.transactionId !== transactionId) {
      throw new Error("Transaction verification failed");
    }

    if (phonePeResponse.data.amount !== order[0].total) {
      throw new Error("Transaction amount mismatch");
    }

    if (phonePeResponse.data.status !== status) {
      throw new Error(`Status mismatch: PhonePe returned ${phonePeResponse.data.status}, received ${status}`);
    }

    // Update payment and order status based on verification
    if (status === "SUCCESS") {
      await conn.query(
        `UPDATE payments SET status = 'SUCCESS', paidAt = NOW() WHERE id = ?`,
        [payment[0].id]
      );
      await conn.query(
        `UPDATE orders SET payment_status = 'SUCCESS', status = 'Confirmed' WHERE id = ?`,
        [orderId]
      );
    } else if (status === "FAILED" || status === "CANCELLED") {
      await conn.query(
        `UPDATE payments SET status = ? WHERE id = ?`,
        [status, payment[0].id]
      );
      await conn.query(
        `UPDATE orders SET payment_status = ?, status = 'Cancelled' WHERE id = ?`,
        [status, orderId]
      );
    }

    await conn.commit();
    console.log(`✅ Payment verified: ${status}`, { orderId, transactionId });
    res.json({ success: true, status, orderId, paymentId: payment[0].id });
  } catch (err) {
    await conn.rollback();
    console.error("🔥 VERIFY PAYMENT ERROR:", err.message);
    res.status(500).json({ error: "Failed to verify payment" });
  } finally {
    conn.release();
  }
});

// POST /api/payments/cancel
router.post("/cancel", async (req, res) => {
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

module.exports = router;