const express = require('express');
const router = express.Router();
const mysql = require('mysql2/promise');
const jwt = require('jsonwebtoken');
const cloudinary = require('cloudinary').v2;
const multer = require('multer');
const { v4: uuidv4 } = require('uuid');
const sanitizeHtml = require('sanitize-html');
require('dotenv').config();

// MySQL Pool
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

// Cloudinary config
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

// Multer setup
const storage = multer.memoryStorage();
const upload = multer({
  storage,
  fileFilter: (_req, file, cb) => {
    const allowed = ['image/jpeg', 'image/png', 'image/jpg'];
    cb(allowed.includes(file.mimetype) ? null : new Error('Only JPEG/PNG allowed'), allowed.includes(file.mimetype));
  },
  limits: { fileSize: 5 * 1024 * 1024 },
});

// Admin verification
const verifyAdmin = (req, res, next) => {
  const authHeader = req.headers.authorization || '';
  if (!authHeader.startsWith('Bearer ')) return res.status(401).json({ error: 'No token provided' });
  try {
    const decoded = jwt.verify(authHeader.split(' ')[1], process.env.JWT_SECRET);
    if (decoded.role !== 'admin') return res.status(403).json({ error: 'Admin access required' });
    req.user = decoded;
    next();
  } catch (err) {
    return res.status(401).json({ error: 'Invalid or expired token' });
  }
};

// Sanitize input
const sanitizeInput = (input) => input ? sanitizeHtml(input, { allowedTags: [], allowedAttributes: {} }).trim() : null;

/* ────────── GET All Menu Items ────────── */
router.get('/', verifyAdmin, async (_req, res) => {
  try {
    const [rows] = await pool.query(`
      SELECT id, name, COALESCE(description,'') AS description, price, category_id, COALESCE(image_url,'') AS image_url, available, created_at, updated_at
      FROM menu_items
      ORDER BY name ASC
    `);
    res.json({ data: rows.map(r => ({
      id: r.id,
      name: r.name,
      description: r.description || null,
      price: Number(r.price),
      category_id: Number(r.category_id),
      image_url: r.image_url || null,
      available: r.available,
      created_at: r.created_at ? new Date(r.created_at).toISOString() : null,
      updated_at: r.updated_at ? new Date(r.updated_at).toISOString() : null
    })) });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/* ────────── CREATE Menu Item ────────── */
router.post('/', verifyAdmin, upload.single('image'), async (req, res) => {
  const { name, description, price, category_id } = req.body;
  const sanitizedName = sanitizeInput(name);
  const sanitizedDescription = sanitizeInput(description);
  const sanitizedPrice = Number(price);
  const sanitizedCategoryId = Number(category_id);

  if (!sanitizedName || !sanitizedPrice || !sanitizedCategoryId) return res.status(400).json({ error: 'Name, price, category_id required' });

  try {
    const [exists] = await pool.query(`SELECT id FROM menu_items WHERE name = ?`, [sanitizedName]);
    if (exists.length) return res.status(400).json({ error: 'Menu item already exists' });

    const [categoryCheck] = await pool.query(`SELECT id FROM categories WHERE id = ?`, [sanitizedCategoryId]);
    if (!categoryCheck.length) return res.status(400).json({ error: 'Invalid category_id' });

    let imageUrl = null;
    if (req.file) {
      const uploadResult = await new Promise((resolve, reject) => {
        cloudinary.uploader.upload_stream({ folder: 'menu_items', public_id: `menu_${uuidv4()}`, format: 'jpg' }, (err, result) => err ? reject(err) : resolve(result))
          .end(req.file.buffer);
      });
      imageUrl = uploadResult.secure_url;
    }

    const [insert] = await pool.execute(
      `INSERT INTO menu_items (name, description, price, category_id, image_url, available, created_at) VALUES (?, ?, ?, ?, ?, 1, NOW())`,
      [sanitizedName, sanitizedDescription, sanitizedPrice, sanitizedCategoryId, imageUrl]
    );

    res.status(201).json({ data: { id: insert.insertId, name: sanitizedName, description: sanitizedDescription, price: sanitizedPrice, category_id: sanitizedCategoryId, image_url: imageUrl, available: 1 } });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/* ────────── UPDATE Menu Item ────────── */
router.put('/:id', verifyAdmin, upload.single('image'), async (req, res) => {
  const { id } = req.params;
  const { name, description, price, category_id } = req.body;
  const sanitizedName = sanitizeInput(name);
  const sanitizedDescription = sanitizeInput(description);
  const sanitizedPrice = Number(price);
  const sanitizedCategoryId = Number(category_id);

  if (!sanitizedName || !sanitizedPrice || !sanitizedCategoryId) return res.status(400).json({ error: 'Name, price, category_id required' });

  try {
    const [rows] = await pool.query(`SELECT image_url FROM menu_items WHERE id = ?`, [id]);
    if (!rows.length) return res.status(404).json({ error: 'Menu item not found' });

    const [exists] = await pool.query(`SELECT id FROM menu_items WHERE name = ? AND id != ?`, [sanitizedName, id]);
    if (exists.length) return res.status(400).json({ error: 'Menu item name already exists' });

    const [categoryCheck] = await pool.query(`SELECT id FROM categories WHERE id = ?`, [sanitizedCategoryId]);
    if (!categoryCheck.length) return res.status(400).json({ error: 'Invalid category_id' });

    let imageUrl = rows[0].image_url;
    if (req.file) {
      if (rows[0].image_url) {
        const match = rows[0].image_url.match(/menu_items\/([^/.]+)/);
        if (match) await cloudinary.uploader.destroy(`menu_items/${match[1]}`).catch(() => {});
      }
      const uploadResult = await new Promise((resolve, reject) => {
        cloudinary.uploader.upload_stream({ folder: 'menu_items', public_id: `menu_${uuidv4()}`, format: 'jpg' }, (err, result) => err ? reject(err) : resolve(result))
          .end(req.file.buffer);
      });
      imageUrl = uploadResult.secure_url;
    }

    await pool.execute(
      `UPDATE menu_items SET name=?, description=?, price=?, category_id=?, image_url=?, updated_at=NOW() WHERE id=?`,
      [sanitizedName, sanitizedDescription, sanitizedPrice, sanitizedCategoryId, imageUrl, id]
    );

    res.json({ data: { id: Number(id), name: sanitizedName, description: sanitizedDescription, price: sanitizedPrice, category_id: sanitizedCategoryId, image_url: imageUrl } });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/* ────────── DELETE Menu Item ────────── */
router.delete('/:id', verifyAdmin, async (req, res) => {
  const { id } = req.params;
  try {
    const [rows] = await pool.query(`SELECT image_url FROM menu_items WHERE id = ?`, [id]);
    if (!rows.length) return res.status(404).json({ error: 'Menu item not found' });

    if (rows[0].image_url) {
      const match = rows[0].image_url.match(/menu_items\/([^/.]+)/);
      if (match) await cloudinary.uploader.destroy(`menu_items/${match[1]}`).catch(() => {});
    }

    await pool.execute(`DELETE FROM menu_items WHERE id = ?`, [id]);
    res.json({ message: 'Menu item deleted successfully' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
