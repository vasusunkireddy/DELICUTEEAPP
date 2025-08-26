const express = require("express");
const pool = require("../db");
const router = express.Router();

// POST /api/customer-orders
router.post("/customer-orders", async (req, res) => {
  const { userId, address, total, cartItems, payment, status, couponCode } = req.body;
  console.log("📡 POST /api/customer-orders", { userId, address, total, cartItems, payment, status, couponCode });

  // Validate input
  if (!userId || !address || !total || total <= 0 || !cartItems || !Array.isArray(cartItems) || cartItems.length === 0 || !payment || !status) {
    return res.status(400).json({ error: "Missing or invalid fields (userId, address, total, cartItems, payment, status)" });
  }

  if (payment !== "COD") {
    return res.status(400).json({ error: "Only Cash on Delivery (COD) is supported" });
  }

  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();

    // Insert order
    const [orderResult] = await conn.query(
      `INSERT INTO orders (user_id, address, total, payment_method, payment_status, status, created_at)
       VALUES (?, ?, ?, ?, ?, ?, NOW())`,
      [userId, address, total, payment, payment === "COD" ? "SUCCESS" : "PENDING", status]
    );

    const orderId = orderResult.insertId;
    if (!orderId) throw new Error("Failed to create order: No orderId returned");

    // Insert order items
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

    // Apply coupon if provided (optional)
    if (couponCode) {
      const [coupon] = await conn.query(`SELECT discount FROM coupons WHERE code = ? AND valid = 1`, [couponCode]);
      if (coupon.length === 0) throw new Error("Invalid or expired coupon code");
      // Apply discount logic here if needed (e.g., update total)
    }

    await conn.commit();
    console.log("✅ Order created:", { orderId });
    res.json({ success: true, orderId });
  } catch (err) {
    await conn.rollback();
    console.error("🔥 CREATE ORDER ERROR:", err.message);
    res.status(500).json({ error: `Failed to create order: ${err.message}` });
  } finally {
    conn.release();
  }
});

// POST /api/payments/create
router.post("/payments/create", async (req, res) => {
  const { orderId, customerId, method, amount } = req.body;
  console.log("📡 POST /api/payments/create", { orderId, customerId, method, amount });

  // Validate input
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

    // Verify order exists and belongs to customer
    const [order] = await conn.query(
      `SELECT id FROM orders WHERE id = ? AND user_id = ?`,
      [orderId, customerId]
    );

    if (order.length === 0) {
      throw new Error("Order not found or customer mismatch");
    }

    // Insert payment
    const [result] = await conn.query(
      `INSERT INTO payments (orderId, customerId, method, amount, status, paidAt)
       VALUES (?, ?, ?, ?, ?, NOW())`,
      [orderId, customerId, method, amount, "SUCCESS"]
    );

    // Update order with payment details
    await conn.query(
      `UPDATE orders SET payment_status = ?, payment_method = ?, payment_id = ? WHERE id = ? AND user_id = ?`,
      ["SUCCESS", method, result.insertId, orderId, customerId]
    );

    await conn.commit();
    console.log("✅ Payment record created:", { paymentId: result.insertId });
    res.json({
      success: true,
      paymentId: result.insertId,
      status: "SUCCESS",
      orderId,
    });
  } catch (err) {
    await conn.rollback();
    console.error("🔥 CREATE PAYMENT ERROR:", err.message);
    res.status(500).json({ error: `Failed to create payment: ${err.message}` });
  } finally {
    conn.release();
  }
});

// POST /api/payments/cancel
router.post("/payments/cancel", async (req, res) => {
  const { orderId, customerId } = req.body;
  console.log("📡 POST /api/payments/cancel", { orderId, customerId });

  // Validate input
  if (!orderId || !customerId) {
    return res.status(400).json({ error: "Missing orderId or customerId" });
  }

  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();

    // Verify order exists and belongs to customer
    const [order] = await conn.query(
      `SELECT id FROM orders WHERE id = ? AND user_id = ?`,
      [orderId, customerId]
    );

    if (order.length === 0) {
      throw new Error("Order not found or customer mismatch");
    }

    // Update payment status
    const [paymentUpdate] = await conn.query(
      `UPDATE payments SET status = 'CANCELLED' WHERE orderId = ? AND customerId = ? AND status = 'PENDING'`,
      [orderId, customerId]
    );

    if (paymentUpdate.affectedRows === 0) {
      throw new Error("Payment not found, not pending, or customer mismatch");
    }

    // Update order status
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
    res.status(500).json({ error: `Failed to cancel payment: ${err.message}` });
  } finally {
    conn.release();
  }
});

// DELETE /api/cart
router.delete("/cart", async (req, res) => {
  const { userId } = req.body; // Alternatively, get userId from auth token (recommended)
  console.log("📡 DELETE /api/cart", { userId });

  // Validate input
  if (!userId) {
    return res.status(400).json({ error: "Missing userId" });
  }

  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();

    // Delete cart items for the user
    const [result] = await conn.query(
      `DELETE FROM cart WHERE user_id = ?`,
      [userId]
    );

    await conn.commit();
    console.log("✅ Cart cleared for user:", { userId, deletedRows: result.affectedRows });
    res.json({ success: true, message: "Cart cleared successfully" });
  } catch (err) {
    await conn.rollback();
    console.error("🔥 CLEAR CART ERROR:", err.message);
    res.status(500).json({ error: `Failed to clear cart: ${err.message}` });
  } finally {
    conn.release();
  }
});

module.exports = router;