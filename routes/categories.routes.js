const express = require('express');
const router = express.Router();
const mysql = require('mysql2/promise');
const jwt = require('jsonwebtoken');
const cloudinary = require('cloudinary').v2;
const multer = require('multer');
const { v4: uuidv4 } = require('uuid');
const sanitizeHtml = require('sanitize-html');
require('dotenv').config();

/* ─────────────────── DB Config ─────────────────── */
const pool = mysql.createPool({
  host: process.env.DB_HOST,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
  connectionLimit: 10,
});

/* ─────────────────── Cloudinary Config ─────────────────── */
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

/* ─────────────────── Multer Config ─────────────────── */
const storage = multer.memoryStorage();
const upload = multer({
  storage,
  fileFilter: (req, file, cb) => {
    const allowed = ['image/jpeg', 'image/png', 'image/jpg'];
    cb(allowed.includes(file.mimetype) ? null : new Error('Only JPEG and PNG images allowed'), allowed.includes(file.mimetype));
  },
  limits: { fileSize: 5 * 1024 * 1024 },
});

/* ─────────────────── JWT Verify Middleware ─────────────────── */
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

/* ─────────────────── Input Sanitization ─────────────────── */
const sanitizeInput = (input) =>
  input
    ? sanitizeHtml(input, { allowedTags: [], allowedAttributes: {} }).trim()
    : null;

/* ─────────────────── GET All Categories ─────────────────── */
router.get('/', async (_req, res) => {
  try {
    const [rows] = await pool.query(
      `SELECT id, name, description, image AS image_url FROM categories ORDER BY name ASC`
    );
    res.json(rows.map(r => ({
      id: r.id,
      name: r.name,
      description: r.description || null,
      image: r.image_url || null,
    })));
  } catch (error) {
    console.error('Fetch categories error:', error.message);
    res.status(500).json({ error: 'Failed to fetch categories' });
  }
});

/* ─────────────────── Create Category ─────────────────── */
router.post('/', verifyAdmin, upload.single('image'), async (req, res) => {
  const { name, description, image } = req.body;
  const sanitizedName = sanitizeInput(name);
  const sanitizedDescription = sanitizeInput(description);
  if (!sanitizedName) return res.status(400).json({ error: 'Category name is required' });

  let imageUrl = sanitizeInput(image) || null;

  try {
    const [existing] = await pool.query(`SELECT id FROM categories WHERE name = ?`, [sanitizedName]);
    if (existing.length) return res.status(400).json({ error: 'Category name already exists' });

    if (req.file) {
      const uploadResult = await new Promise((resolve, reject) => {
        cloudinary.uploader.upload_stream(
          { folder: 'categories', public_id: `category_${uuidv4()}`, format: 'jpg' },
          (err, result) => (err ? reject(err) : resolve(result))
        ).end(req.file.buffer);
      });
      imageUrl = uploadResult.secure_url;
    }

    const connection = await pool.getConnection();
    try {
      await connection.beginTransaction();
      const [insert] = await connection.execute(
        `INSERT INTO categories (name, description, image, created_at) VALUES (?, ?, ?, NOW())`,
        [sanitizedName, sanitizedDescription, imageUrl]
      );
      await connection.commit();

      return res.status(201).json({
        data: {
          id: insert.insertId,
          name: sanitizedName,
          description: sanitizedDescription,
          image: imageUrl,
        },
      });
    } catch (err) {
      await connection.rollback();
      throw err;
    } finally {
      connection.release();
    }
  } catch (error) {
    console.error('Create category error:', error.message);
    res.status(500).json({ error: 'Failed to create category' });
  }
});

/* ─────────────────── Update Category ─────────────────── */
router.put('/:id', verifyAdmin, upload.single('image'), async (req, res) => {
  const { id } = req.params;
  const { name, description, image } = req.body;
  const sanitizedName = sanitizeInput(name);
  const sanitizedDescription = sanitizeInput(description);
  if (!sanitizedName) return res.status(400).json({ error: 'Category name is required' });

  try {
    const [rows] = await pool.query(`SELECT image FROM categories WHERE id = ?`, [id]);
    if (!rows.length) return res.status(404).json({ error: 'Category not found' });

    const [existing] = await pool.query(
      `SELECT id FROM categories WHERE name = ? AND id != ?`,
      [sanitizedName, id]
    );
    if (existing.length) return res.status(400).json({ error: 'Category name already exists' });

    let imageUrl = sanitizeInput(image) || rows[0].image;

    if (req.file) {
      if (rows[0].image) {
        const match = rows[0].image.match(/categories\/([^/.]+)/);
        if (match) await cloudinary.uploader.destroy(`categories/${match[1]}`).catch(() => {});
      }
      const uploadResult = await new Promise((resolve, reject) => {
        cloudinary.uploader.upload_stream(
          { folder: 'categories', public_id: `category_${uuidv4()}`, format: 'jpg' },
          (err, result) => (err ? reject(err) : resolve(result))
        ).end(req.file.buffer);
      });
      imageUrl = uploadResult.secure_url;
    }

    const connection = await pool.getConnection();
    try {
      await connection.beginTransaction();
      await connection.execute(
        `UPDATE categories SET name = ?, description = ?, image = ?, updated_at = NOW() WHERE id = ?`,
        [sanitizedName, sanitizedDescription, imageUrl, id]
      );
      await connection.commit();
      res.json({
        data: {
          id: Number(id),
          name: sanitizedName,
          description: sanitizedDescription,
          image: imageUrl,
        },
      });
    } catch (err) {
      await connection.rollback();
      throw err;
    } finally {
      connection.release();
    }
  } catch (error) {
    console.error('Update category error:', error.message);
    res.status(500).json({ error: 'Failed to update category' });
  }
});

/* ─────────────────── Delete Category ─────────────────── */
router.delete('/:id', verifyAdmin, async (req, res) => {
  const { id } = req.params;
  try {
    const [rows] = await pool.query(`SELECT image FROM categories WHERE id = ?`, [id]);
    if (!rows.length) return res.status(404).json({ error: 'Category not found' });

    const [menuItems] = await pool.query(`SELECT id FROM menu_items WHERE category_id = ?`, [id]);
    if (menuItems.length) return res.status(400).json({ error: 'Cannot delete category with associated menu items' });

    if (rows[0].image) {
      const match = rows[0].image.match(/categories\/([^/.]+)/);
      if (match) await cloudinary.uploader.destroy(`categories/${match[1]}`).catch(() => {});
    }

    const connection = await pool.getConnection();
    try {
      await connection.beginTransaction();
      await connection.execute(`DELETE FROM categories WHERE id = ?`, [id]);
      await connection.commit();
      res.json({ message: 'Category deleted successfully' });
    } catch (err) {
      await connection.rollback();
      throw err;
    } finally {
      connection.release();
    }
  } catch (error) {
    console.error('Delete category error:', error.message);
    res.status(500).json({ error: 'Failed to delete category' });
  }
});

module.exports = router;
