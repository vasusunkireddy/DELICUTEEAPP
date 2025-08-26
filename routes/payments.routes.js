const express = require("express");
const pool = require("../db");
const router = express.Router();

// POST /api/customer-orders
router.post("/customer-orders", async (req, res) => {
  const { userId, address, total, cartItems, payment, status, couponCode } = req.body;
  console.log("📡 POST /api/customer-orders", { userId, address, total, cartItems, payment, status, couponCode });

  if (!userId || !address || !total || total <= 0 || !cartItems || !Array.isArray(cartItems) || cartItems.length === 0 || !payment || !status) {
    return res.status(400).json({ error: "Missing or invalid fields (userId, address, total, cartItems, payment, status)" });
  }

  if (payment !== "COD" && payment !== "UPI") {
    return res.status(400).json({ error: "Only Cash on Delivery (COD) and UPI are supported" });
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