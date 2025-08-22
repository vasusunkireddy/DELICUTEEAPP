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

  if (payment !== "COD") {
    return res.status(400).json({ error: "Only Cash on Delivery (COD) is supported" });
  }

  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();

    const orderUid = `order_${Date.now()}`;
    const [orderResult] = await conn.query(
      `INSERT INTO orders (orderUid, user_id, address, total, payment_method, payment_status, status, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, NOW())`,
      [orderUid, userId, address, total, payment, payment === "COD" ? "SUCCESS" : "PENDING", status]
    );

    const orderId = orderResult.insertId;

    for (const item of cartItems) {
      if (!item.itemId || !item.name || !item.price || item.price <= 0 || !item.quantity || item.quantity <= 0) {
        throw new Error("Invalid cart item: missing or invalid itemId, name, price, or quantity");
      }
      await conn.query(
        `INSERT INTO order_items (order_id, itemId, name, price, qty)
         VALUES (?, ?, ?, ?, ?)`,
        [orderId, item.itemId, item.name, item.price, item.quantity]
      );
    }

    await conn.commit();
    console.log("✅ Order created:", { orderId, orderUid });
    res.json({ success: true, orderUid });
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
  const { orderUid, customerId, method, amount } = req.body;
  console.log("📡 POST /api/payments/create", { orderUid, customerId, method, amount });

  if (!orderUid || !customerId || !method || !amount || amount <= 0) {
    return res.status(400).json({
      error: "Missing or invalid fields (orderUid, customerId, method, amount)",
    });
  }

  if (method !== "COD") {
    return res.status(400).json({ error: "Only Cash on Delivery (COD) is supported" });
  }

  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();

    const [order] = await conn.query(
      `SELECT id FROM orders WHERE orderUid = ? AND user_id = ?`,
      [orderUid, customerId]
    );

    if (order.length === 0) {
      throw new Error("Order not found or customer mismatch");
    }

    const orderId = order[0].id;

    const [result] = await conn.query(
      `INSERT INTO payments (orderUid, customerId, method, amount, status, paidAt)
       VALUES (?, ?, ?, ?, ?, NOW())`,
      [orderUid, customerId, method, amount, "SUCCESS"]
    );

    await conn.query(
      `UPDATE orders SET payment_status = ?, payment_method = ?, payment_id = ? WHERE orderUid = ? AND user_id = ?`,
      ["SUCCESS", method, result.insertId, orderUid, customerId]
    );

    await conn.commit();
    console.log("✅ Payment record created:", result.insertId);
    res.json({
      success: true,
      paymentId: result.insertId,
      status: "SUCCESS",
      orderUid,
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
  const { orderUid, customerId } = req.body;
  console.log("📡 POST /api/payments/cancel", { orderUid, customerId });

  if (!orderUid || !customerId) {
    return res.status(400).json({ error: "Missing orderUid or customerId" });
  }

  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();

    const [order] = await conn.query(
      `SELECT id FROM orders WHERE orderUid = ? AND user_id = ?`,
      [orderUid, customerId]
    );

    if (order.length === 0) {
      throw new Error("Order not found or customer mismatch");
    }

    const [paymentUpdate] = await conn.query(
      `UPDATE payments SET status = 'CANCELLED' WHERE orderUid = ? AND customerId = ? AND status = 'PENDING'`,
      [orderUid, customerId]
    );

    if (paymentUpdate.affectedRows === 0) {
      throw new Error("Payment not found, not pending, or customer mismatch");
    }

    await conn.query(
      `UPDATE orders SET payment_status = 'CANCELLED', status = 'Cancelled' WHERE orderUid = ? AND user_id = ?`,
      [orderUid, customerId]
    );

    await conn.commit();
    console.log("✅ Payment cancelled:", { orderUid });
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