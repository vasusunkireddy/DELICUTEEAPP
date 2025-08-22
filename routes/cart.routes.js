const express = require('express');
const jwt = require('jsonwebtoken');
const pool = require('../db');

const router = express.Router();

/** ----------------------- AUTH ----------------------- */
function verifyToken(req, res, next) {
  const token = (req.headers.authorization || '').replace('Bearer ', '');
  if (!token) return res.status(401).json({ error: 'Auth token missing' });
  try {
    req.user = jwt.verify(token, process.env.JWT_SECRET);
    next();
  } catch {
    res.status(401).json({ error: 'Invalid or expired token' });
  }
}
router.use(verifyToken);

/** ----------------------- HELPERS ----------------------- */
const toInt = (v) => {
  if (v === null || v === undefined || v === '') return NaN;
  const n = Number(v);
  return Number.isFinite(n) ? Math.trunc(n) : NaN;
};

async function ensureMenuItemExists(id) {
  const [rows] = await pool.query(
    `SELECT id, name FROM menu_items WHERE id = ? LIMIT 1`,
    [id]
  );
  return rows.length > 0 ? rows[0] : null;
}

async function getCartSummary(userId, couponCode) {
  const [[settings]] = await pool.query(`SELECT delivery_fee FROM settings LIMIT 1`);
  const deliveryFee = Number(settings?.delivery_fee) || 0;

  const [items] = await pool.query(
    `SELECT 
        ci.menu_item_id,
        ci.quantity,
        mi.name,
        mi.price,
        mi.image_url,
        mi.category_id,
        (ci.quantity * mi.price) AS total_price
     FROM cart_items ci
     JOIN menu_items mi ON mi.id = ci.menu_item_id
     WHERE ci.user_id = ?`,
    [userId]
  );

  const formattedItems = items.map(item => ({
    menu_item_id: item.menu_item_id,
    name: item.name,
    quantity: item.quantity,
    price: Number(item.price || 0),
    image_url: item.image_url?.startsWith('/')
      ? `http://192.168.1.4:3000${item.image_url}`
      : item.image_url || null,
    total_price: Number(item.total_price || 0),
    category_id: item.category_id ? Number(item.category_id) : null,
  }));

  const subtotal = formattedItems.reduce((sum, i) => sum + Number(i.total_price), 0);

  // ✅ Coupon logic unchanged (your code was good)
  let coupon = null;
  let discount = 0;
  const code = (couponCode || '').trim().toUpperCase();

  if (code) {
    const [[c]] = await pool.query(
      `SELECT id, code, type, discount, min_qty, category_id, buy_qty, free_qty
       FROM coupons
       WHERE UPPER(code) = ?
         AND (start_date IS NULL OR start_date <= CURDATE())
         AND (end_date IS NULL OR end_date >= CURDATE())
       LIMIT 1`,
      [code]
    );
    if (c) {
      coupon = {
        id: c.id,
        code: c.code,
        type: c.type,
        discount: Number(c.discount) || 0,
        min_qty: c.min_qty ? Number(c.min_qty) : null,
        category_id: c.category_id ? Number(c.category_id) : null,
        buy_qty: c.buy_qty ? Number(c.buy_qty) : null,
        free_qty: c.free_qty ? Number(c.free_qty) : null,
      };

      const totalQty = formattedItems.reduce((sum, i) => sum + i.quantity, 0);
      const categoryQty = {};
      formattedItems.forEach((i) => {
        const cat = i.category_id ? Number(i.category_id) : null;
        if (cat) categoryQty[cat] = (categoryQty[cat] || 0) + i.quantity;
      });

      switch (c.type) {
        case 'PERCENT':
          discount = Number(((subtotal * c.discount) / 100).toFixed(2));
          break;
        case 'BUY_X':
          if (c.category_id) {
            const catQty = categoryQty[c.category_id] || 0;
            if (catQty >= c.min_qty) discount = Number(c.discount) || 0;
            else coupon = null;
          } else if (totalQty >= c.min_qty) {
            discount = Number(c.discount) || 0;
          } else {
            coupon = null;
          }
          break;
        case 'FIRST_ORDER':
          const [[{ cnt }]] = await pool.query(
            'SELECT COUNT(*) AS cnt FROM orders WHERE user_id = ?',
            [userId]
          );
          if (cnt === 0) discount = Number(c.discount) || 0;
          else coupon = null;
          break;
        case 'DATE_RANGE':
          discount = Number(c.discount) || 0;
          break;
        case 'BUY_X_GET_Y':
          if (!c.buy_qty || !c.free_qty) {
            coupon = null;
            break;
          }
          let eligibleItems = formattedItems;
          if (c.category_id) {
            eligibleItems = formattedItems.filter((i) => i.category_id === c.category_id);
          }
          const qtyInCat = eligibleItems.reduce((sum, i) => sum + i.quantity, 0);
          if (qtyInCat < c.buy_qty) {
            coupon = null;
            break;
          }
          const cheapestPrice = eligibleItems.length
            ? Math.min(...eligibleItems.map((i) => Number(i.price)))
            : 0;
          const offerGroups = Math.floor(qtyInCat / (c.buy_qty + c.free_qty));
          discount = Number((offerGroups * c.free_qty * cheapestPrice).toFixed(2));
          break;
        default:
          coupon = null;
      }
    }
  }

  const total = Number((subtotal - discount + (formattedItems.length ? deliveryFee : 0)).toFixed(2));

  return {
    items: formattedItems,
    subtotal: Number(subtotal.toFixed(2)),
    delivery_fee: deliveryFee,
    discount,
    coupon,
    total,
  };
}

/** ----------------------- ROUTES ----------------------- */

// Add or update cart item
router.post('/', async (req, res) => {
  try {
    console.log('[cart.js] Incoming payload:', req.body);
    const userId = req.user.id;
    const itemId = toInt(req.body.menu_item_id);
    const qty = toInt(req.body.quantity ?? 1);

    if (!Number.isInteger(itemId) || itemId <= 0 || !Number.isInteger(qty) || qty < 1) {
      return res.status(400).json({ error: 'menu_item_id and quantity (>=1) are required' });
    }

    const menuItem = await ensureMenuItemExists(itemId);
    if (!menuItem) {
      return res.status(404).json({ error: 'Menu item not found' });
    }

    const [existing] = await pool.query(
      `SELECT id FROM cart_items WHERE user_id = ? AND menu_item_id = ?`,
      [userId, itemId]
    );

    if (existing.length) {
      await pool.query(
        `UPDATE cart_items SET quantity = ? WHERE user_id = ? AND menu_item_id = ?`,
        [qty, userId, itemId]
      );
    } else {
      const [menuData] = await pool.query(
        `SELECT name, price, image_url, category_id FROM menu_items WHERE id = ?`,
        [itemId]
      );
      const { name, price, image_url, category_id } = menuData[0];
      await pool.query(
        `INSERT INTO cart_items (user_id, menu_item_id, quantity, name, price, image_url, category_id)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [userId, itemId, qty, name, price, image_url, category_id]
      );
    }

    const summary = await getCartSummary(userId, req.query?.coupon);
    return res.json({ ok: true, cart: summary });
  } catch (err) {
    console.error('[cart.js] Add/update error:', err);
    if (err?.code === 'ER_NO_REFERENCED_ROW_2') {
      return res.status(400).json({ error: 'Invalid menu_item_id (not found in menu_items)' });
    }
    return res.status(500).json({ error: 'Internal server error' });
  }
});

// Update quantity or remove
async function updateItem(req, res) {
  try {
    const userId = req.user.id;
    const itemId = toInt(req.params.itemId);
    const qty = toInt(req.body.quantity);

    if (!Number.isInteger(itemId) || itemId <= 0) {
      return res.status(400).json({ error: 'Invalid itemId' });
    }
    if (!Number.isInteger(qty)) {
      return res.status(400).json({ error: 'quantity required' });
    }

    if (qty <= 0) {
      await pool.query(
        `DELETE FROM cart_items WHERE user_id = ? AND menu_item_id = ?`,
        [userId, itemId]
      );
      const summary = await getCartSummary(userId, req.query?.coupon);
      return res.json({ removed: true, cart: summary });
    }

    const menuItem = await ensureMenuItemExists(itemId);
    if (!menuItem) {
      return res.status(404).json({ error: 'Menu item not found' });
    }

    const [existing] = await pool.query(
      `SELECT id FROM cart_items WHERE user_id = ? AND menu_item_id = ?`,
      [userId, itemId]
    );

    if (existing.length) {
      await pool.query(
        `UPDATE cart_items SET quantity = ? WHERE user_id = ? AND menu_item_id = ?`,
        [qty, userId, itemId]
      );
    } else {
      const [menuData] = await pool.query(
        `SELECT name, price, image_url, category_id FROM menu_items WHERE id = ?`,
        [itemId]
      );
      const { name, price, image_url, category_id } = menuData[0];
      await pool.query(
        `INSERT INTO cart_items (user_id, menu_item_id, quantity, name, price, image_url, category_id)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [userId, itemId, qty, name, price, image_url, category_id]
      );
    }

    const summary = await getCartSummary(userId, req.query?.coupon);
    return res.json({ ok: true, cart: summary });
  } catch (err) {
    console.error('[cart.js] Update error:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
}
router.patch('/:itemId', updateItem);
router.put('/:itemId', updateItem);

// Delete cart item
router.delete('/:itemId', async (req, res) => {
  try {
    const userId = req.user.id;
    const itemId = toInt(req.params.itemId);
    if (!Number.isInteger(itemId) || itemId <= 0) {
      return res.status(400).json({ error: 'Invalid itemId' });
    }

    await pool.query(
      `DELETE FROM cart_items WHERE user_id = ? AND menu_item_id = ?`,
      [userId, itemId]
    );

    const summary = await getCartSummary(userId, req.query?.coupon);
    return res.json({ ok: true, cart: summary });
  } catch (err) {
    console.error('[cart.js] Delete error:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

// Clear entire cart
router.delete('/', async (req, res) => {
  try {
    const userId = req.user.id;
    await pool.query(`DELETE FROM cart_items WHERE user_id = ?`, [userId]);
    const summary = await getCartSummary(userId, req.query?.coupon);
    return res.json({ ok: true, cart: summary });
  } catch (err) {
    console.error('[cart.js] Clear cart error:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

// Get full cart
router.get('/', async (req, res) => {
  try {
    const summary = await getCartSummary(req.user.id, req.query.coupon);
    return res.json(summary);
  } catch (err) {
    console.error('[cart.js] Fetch error:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

// Global error handler
router.use((err, req, res, next) => {
  console.error('[cart.js] Unhandled error:', err);
  res.status(500).json({ error: 'Internal server error' });
});

module.exports = router;
