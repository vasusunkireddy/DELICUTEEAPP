const express = require('express');
const multer = require('multer');
const dayjs = require('dayjs');
const sanitizeHtml = require('sanitize-html');
const pool = require('../db');
const cloudinary = require('cloudinary').v2;

const router = express.Router();

/* ── Cloudinary Configuration ── */
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

/* ── Multer: Store in memory, limit file size ── */
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 }, // 5MB limit
  fileFilter: (req, file, cb) => {
    // Accept only images
    if (!file.mimetype.startsWith('image/')) {
      return cb(new Error('Only image files are allowed'), false);
    }
    cb(null, true);
  },
});

/* ── Helpers ── */
const clean = (s) =>
  sanitizeHtml(String(s || ''), {
    allowedTags: [],
    allowedAttributes: {},
  }).trim();

const toMySQLDate = (input) => {
  const d = dayjs(input);
  if (!d.isValid()) {
    throw new Error('Invalid date format');
  }
  return d.format('YYYY-MM-DD HH:mm:ss');
};

const bool01 = (v, fallback = 0) =>
  v === true || v === 1 || v === '1' ? 1 :
  v === false || v === 0 || v === '0' ? 0 : fallback;

const validateBanner = (title, desc, startDate, endDate, url) => {
  if (!title || title.length > 255) {
    throw new Error('Title is required and must be 255 characters or less');
  }
  if (!desc) {
    throw new Error('Description is required');
  }
  if (dayjs(endDate).isBefore(dayjs(startDate))) {
    throw new Error('End date must be after start date');
  }
  if (url && !/^(https?:\/\/)/i.test(url)) {
    throw new Error('Invalid URL format');
  }
};

/* ── CREATE ── */
router.post('/', upload.single('image'), async (req, res) => {
  try {
    const title = clean(req.body.title);
    const desc = clean(req.body.desc || req.body.description);
    const url = req.body.url ? clean(req.body.url) : null; // Optional URL
    const startDate = toMySQLDate(req.body.startDate);
    const endDate = toMySQLDate(req.body.endDate);
    const active = bool01(req.body.active, 1);

    // Validate inputs
    validateBanner(title, desc, startDate, endDate, url);
    if (!req.file) {
      return res.status(400).json({ message: 'Image is required' });
    }

    // Upload to Cloudinary
    const result = await new Promise((resolve, reject) => {
      const stream = cloudinary.uploader.upload_stream(
        { folder: 'delicute/banners', resource_type: 'image' },
        (error, result) => {
          if (error) reject(error);
          else resolve(result);
        }
      );
      stream.end(req.file.buffer);
    });

    const imageUrl = result.secure_url;
    const publicId = result.public_id;

    // Insert into database
    const [dbResult] = await pool.query(
      `INSERT INTO banners (title, \`desc\`, image, image_public_id, url, startDate, endDate, active)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [title, desc, imageUrl, publicId, url, startDate, endDate, active]
    );

    res.status(201).json({
      message: 'Banner created',
      id: dbResult.insertId,
      title,
      desc,
      url,
      imageUrl,
      startDate,
      endDate,
      active: !!active,
    });
  } catch (e) {
    console.error('POST /banners error:', e);
    res.status(e.message.includes('Only image files') || e.message.includes('Invalid URL') ? 400 : 500).json({
      message: e.message || 'Failed to create banner',
    });
  }
});

/* ── READ ALL ── */
router.get('/', async (_req, res) => {
  try {
    const [rows] = await pool.query('SELECT * FROM banners ORDER BY startDate DESC');
    const banners = rows.map(b => ({
      id: b.id,
      title: b.title,
      desc: b.desc,
      description: b.desc, // For frontend compatibility
      url: b.url, // Include URL
      imageUrl: b.image,
      startDate: b.startDate,
      endDate: b.endDate,
      active: !!b.active,
    }));
    res.json(banners);
  } catch (e) {
    console.error('GET /banners error:', e);
    res.status(500).json({ message: 'Failed to fetch banners' });
  }
});

/* ── READ ACTIVE ── */
router.get('/active', async (_req, res) => {
  try {
    const [rows] = await pool.query(
      `SELECT id, title, \`desc\` AS description, image AS imageUrl, url, startDate, endDate, active
       FROM banners
       WHERE active = 1 AND NOW() >= startDate AND NOW() <= endDate
       ORDER BY startDate DESC`
    );
    res.json(rows.map(b => ({ ...b, active: !!b.active })));
  } catch (e) {
    console.error('GET /banners/active error:', e);
    res.status(500).json({ message: 'Failed to fetch active banners' });
  }
});

/* ── UPDATE ── */
router.put('/:id', upload.single('image'), async (req, res) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id <= 0) {
      return res.status(400).json({ message: 'Invalid banner ID' });
    }

    // Check if banner exists
    const [[existing]] = await pool.query('SELECT * FROM banners WHERE id = ?', [id]);
    if (!existing) {
      return res.status(404).json({ message: 'Banner not found' });
    }

    // Get and validate fields
    const title = req.body.title != null ? clean(req.body.title) : existing.title;
    const desc = req.body.desc != null ? clean(req.body.desc || req.body.description) : existing.desc;
    const url = req.body.url != null ? clean(req.body.url) : existing.url; // Handle URL update
    const startDate = req.body.startDate ? toMySQLDate(req.body.startDate) : existing.startDate;
    const endDate = req.body.endDate ? toMySQLDate(req.body.endDate) : existing.endDate;
    const active = req.body.active != null ? bool01(req.body.active, existing.active) : existing.active;

    validateBanner(title, desc, startDate, endDate, url);

    let imageUrl = existing.image;
    let publicId = existing.image_public_id;

    // Handle new image upload
    if (req.file) {
      const result = await new Promise((resolve, reject) => {
        const stream = cloudinary.uploader.upload_stream(
          { folder: 'delicute/banners', resource_type: 'image' },
          (error, result) => {
            if (error) reject(error);
            else resolve(result);
          }
        );
        stream.end(req.file.buffer);
      });

      imageUrl = result.secure_url;
      publicId = result.public_id;

      // Delete old image from Cloudinary (best-effort)
      if (existing.image_public_id) {
        try {
          await cloudinary.uploader.destroy(existing.image_public_id);
        } catch (e) {
          console.warn('Failed to delete old Cloudinary image:', e.message);
        }
      }
    }

    // Update database
    const [dbResult] = await pool.query(
      `UPDATE banners
       SET title = ?, \`desc\` = ?, image = ?, image_public_id = ?, url = ?, startDate = ?, endDate = ?, active = ?
       WHERE id = ?`,
      [title, desc, imageUrl, publicId, url, startDate, endDate, active, id]
    );

    if (dbResult.affectedRows === 0) {
      return res.status(404).json({ message: 'Banner not found' });
    }

    res.json({
      message: 'Banner updated',
      id,
      title,
      desc,
      url,
      imageUrl,
      startDate,
      endDate,
      active: !!active,
    });
  } catch (e) {
    console.error('PUT /banners/:id error:', e);
    res.status(e.message.includes('Only image files') || e.message.includes('Invalid date') || e.message.includes('Invalid URL') ? 400 : 500).json({
      message: e.message || 'Failed to update banner',
    });
  }
});

/* ── DELETE ── */
router.delete('/:id', async (req, res) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id <= 0) {
      return res.status(400).json({ message: 'Invalid banner ID' });
    }

    // Check if banner exists
    const [[existing]] = await pool.query('SELECT image_public_id FROM banners WHERE id = ?', [id]);
    if (!existing) {
      return res.status(404).json({ message: 'Banner not found' });
    }

    // Delete from database
    const [dbResult] = await pool.query('DELETE FROM banners WHERE id = ?', [id]);
    if (dbResult.affectedRows === 0) {
      return res.status(404).json({ message: 'Banner not found' });
    }

    // Delete from Cloudinary (best-effort)
    if (existing.image_public_id) {
      try {
        await cloudinary.uploader.destroy(existing.image_public_id);
      } catch (e) {
        console.warn('Failed to delete Cloudinary image:', e.message);
      }
    }

    res.json({ message: 'Banner deleted' });
  } catch (e) {
    console.error('DELETE /banners/:id error:', e);
    res.status(500).json({ message: 'Failed to delete banner' });
  }
});

module.exports = router;