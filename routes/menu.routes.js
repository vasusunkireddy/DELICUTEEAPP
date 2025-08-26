const express = require('express');
const router = express.Router();
const mysql = require('mysql2/promise');
const jwt = require('jsonwebtoken');
const cloudinary = require('cloudinary').v2;
const multer = require('multer');
const { v4: uuidv4 } = require('uuid');
const sanitizeHtml = require('sanitize-html');
require('dotenv').config();

const pool = mysql.createPool({
  host: process.env.DB_HOST,
  port: process.env.DB_PORT || 3306,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0,
  connectTimeout: 20000,
});

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

const storage = multer.memoryStorage();
const upload = multer({
  storage,
  fileFilter: (req, file, cb) => {
    const allowed = ['image/jpeg', 'image/png', 'image/jpg'];
    cb(allowed.includes(file.mimetype) ? null : new Error('Only JPEG and PNG images allowed'), allowed.includes(file.mimetype));
  },
  limits: { fileSize: 5 * 1024 * 1024 },
});

const verifyAdmin = (req, res, next) => {
  const authHeader = req.headers.authorization || '';
  if (!authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'No token provided' });
  }
  try {
    const decoded = jwt.verify(authHeader.split(' ')[1], process.env.JWT_SECRET);
    if (decoded.role !== 'admin') return res.status(403).json({ error: 'Admin access required' });
    req.user = decoded;
    next();
  } catch (err) {
    console.error('JWT verify error:', err.message);
    return res.status(401).json({ error: 'Invalid or expired token' });
  }
};

const sanitizeInput = (input) =>
  input ? sanitizeHtml(input, { allowedTags: [], allowedAttributes: {} }).trim() : null;

/* ─────────────────── GET All Menu Items ─────────────────── */
router.get('/', verifyAdmin, async (_req, res) => {
  try {
    const [rows] = await pool.query(`
      SELECT 
        id, 
        name, 
        COALESCE(description, '') AS description, 
        price,
        category_id,
        COALESCE(image_url, '') AS image_url,
        available,
        created_at,
        updated_at
      FROM menu_items
      ORDER BY name ASC
    `);

    const menuItems = rows.map(r => ({
      id: r.id,
      name: r.name,
      description: r.description || null,
      price: Number(r.price),
      category_id: Number(r.category_id),
      image_url: r.image_url || null,
      available: r.available,
      created_at: r.created_at ? new Date(r.created_at).toISOString() : null,
      updated_at: r.updated_at ? new Date(r.updated_at).toISOString() : null
    }));

    console.log('Processed menu items:', menuItems);
    res.status(200).json({ data: menuItems });
  } catch (error) {
    console.error('❌ Fetch menu items error:', error.message);
    res.status(500).json({ error: 'Failed to fetch menu items', details: error.message });
  }
});

/* ─────────────────── Create Menu Item ─────────────────── */
router.post('/', verifyAdmin, upload.single('image'), async (req, res) => {
  const { name, description, price, category_id, image_url } = req.body;
  const sanitizedName = sanitizeInput(name);
  const sanitizedDescription = sanitizeInput(description);
  const sanitizedPrice = Number(price);
  const sanitizedCategoryId = Number(category_id);
  let imageUrl = sanitizeInput(image_url) || null;

  if (!sanitizedName || !sanitizedPrice || !sanitizedCategoryId) {
    return res.status(400).json({ error: 'Name, price, and category_id are required' });
  }

  try {
    const [existing] = await pool.query(`SELECT id FROM menu_items WHERE name = ?`, [sanitizedName]);
    if (existing.length) return res.status(400).json({ error: 'Menu item name already exists' });

    const [categoryCheck] = await pool.query(`SELECT id FROM categories WHERE id = ?`, [sanitizedCategoryId]);
    if (!categoryCheck.length) return res.status(400).json({ error: 'Invalid category_id' });

    if (req.file) {
      const uploadResult = await new Promise((resolve, condolences) => {
        cloudinary.uploader.upload_stream(
          { folder: 'menu_items', public_id: `menu_${uuidv4()}`, format: 'jpg' },
          (err, result) => (err ? reject(err) : resolve(result))
        ).end(req.file.buffer);
      });
      imageUrl = uploadResult.secure_url;
    }

    const connection = await pool.getConnection();
    try {
      await connection.beginTransaction();
      const [insert] = await connection.execute(
        `INSERT INTO menu_items (name, description, price, category_id, image_url, available, created_at) 
         VALUES (?, ?, ?, ?, ?, ?, NOW())`,
        [sanitizedName, sanitizedDescription, sanitizedPrice, sanitizedCategoryId, imageUrl, 1]
      );
      await connection.commit();

      return res.status(201).json({
        data: {
          id: insert.insertId,
          name: sanitizedName,
          description: sanitizedDescription,
          price: sanitizedPrice,
          category_id: sanitizedCategoryId,
          image_url: imageUrl,
          available: 1,
          created_at: new Date().toISOString(),
        },
      });
    } catch (err) {
      await connection.rollback();
      throw err;
    } finally {
      connection.release();
    }
  } catch (error) {
    console.error('❌ Create menu item error:', error.message);
    res.status(500).json({ error: 'Failed to create menu item', details: error.message });
  }
});

/* ─────────────────── Update Menu Item ─────────────────── */
router.put('/:id', verifyAdmin, upload.single('image'), async (req, res) => {
  const { id } = req.params;
  const { name, description, price, category_id, image_url } = req.body;
  const sanitizedName = sanitizeInput(name);
  const sanitizedDescription = sanitizeInput(description);
  const sanitizedPrice = Number(price);
  const sanitizedCategoryId = Number(category_id);
  if (!sanitizedName || !sanitizedPrice || !sanitizedCategoryId) {
    return res.status(400).json({ error: 'Name, price, and category_id are required' });
  }

  try {
    const [rows] = await pool.query(`SELECT image_url FROM menu_items WHERE id = ?`, [id]);
    if (!rows.length) return res.status(404).json({ error: 'Menu item not found' });

    const [existing] = await pool.query(
      `SELECT id FROM menu_items WHERE name = ? AND id != ?`,
      [sanitizedName, id]
    );
    if (existing.length) return res.status(400).json({ error: 'Menu item name already exists' });

    const [categoryCheck] = await pool.query(`SELECT id FROM categories WHERE id = ?`, [sanitizedCategoryId]);
    if (!categoryCheck.length) return res.status(400).json({ error: 'Invalid category_id' });

    let imageUrl = sanitizeInput(image_url) || rows[0].image_url;

    if (req.file) {
      if (rows[0].image_url) {
        const match = rows[0].image_url.match(/menu_items\/([^/.]+)/);
        if (match) await cloudinary.uploader.destroy(`menu_items/${match[1]}`).catch(() => {});
      }
      const uploadResult = await new Promise((resolve, reject) => {
        cloudinary.uploader.upload_stream(
          { folder: 'menu_items', public_id: `menu_${uuidv4()}`, format: 'jpg' },
          (err, result) => (err ? reject(err) : resolve(result))
        ).end(req.file.buffer);
      });
      imageUrl = uploadResult.secure_url;
    }

    const connection = await pool.getConnection();
    try {
      await connection.beginTransaction();
      await connection.execute(
        `UPDATE menu_items SET name = ?, description = ?, price = ?, category_id = ?, image_url = ?, updated_at = NOW() WHERE id = ?`,
        [sanitizedName, sanitizedDescription, sanitizedPrice, sanitizedCategoryId, imageUrl, id]
      );
      await connection.commit();
      res.json({
        data: {
          id: Number(id),
          name: sanitizedName,
          description: sanitizedDescription,
          price: sanitizedPrice,
          category_id: sanitizedCategoryId,
          image_url: imageUrl,
          available: 1,
          updated_at: new Date().toISOString(),
        },
      });
    } catch (err) {
      await connection.rollback();
      throw err;
    } finally {
      connection.release();
    }
  } catch (error) {
    console.error('❌ Update menu item error:', error.message);
    res.status(500).json({ error: 'Failed to update menu item', details: error.message });
  }
});

/* ─────────────────── Delete Menu Item ─────────────────── */
router.delete('/:id', verifyAdmin, async (req, res) => {
  const { id } = req.params;
  try {
    const [rows] = await pool.query(`SELECT image_url FROM menu_items WHERE id = ?`, [id]);
    if (!rows.length) return res.status(404).json({ error: 'Menu item not found' });

    if (rows[0].image_url) {
      const match = rows[0].image_url.match(/menu_items\/([^/.]+)/);
      if (match) await cloudinary.uploader.destroy(`menu_items/${match[1]}`).catch(() => {});
    }

    const connection = await pool.getConnection();
    try {
      await connection.beginTransaction();
      await connection.execute(`DELETE FROM menu_items WHERE id = ?`, [id]);
      await connection.commit();
      res.json({ message: 'Menu item deleted successfully' });
    } catch (err) {
      await connection.rollback();
      throw err;
    } finally {
      connection.release();
    }
  } catch (error) {
    console.error('❌ Delete menu item error:', error.message);
    res.status(500).json({ error: 'Failed to delete menu item', details: error.message });
  }
});

module.exports = router;