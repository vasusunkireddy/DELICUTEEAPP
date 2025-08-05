/************************************************************
 *  backend/routes/banners.routes.js
 ************************************************************/
const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const pool = require('../db');

const router = express.Router();

/* ─── Multer setup ─── */
const storage = multer.diskStorage({
  destination: (_, __, cb) =>
    cb(null, path.join(__dirname, '..', 'Uploads', 'banners')),
  filename: (_, file, cb) => {
    const name = Date.now() + '-' + file.originalname.replace(/\s+/g, '_');
    cb(null, name);
  },
});
const upload = multer({ storage });

/* ─── Helper: format date for MySQL ─── */
const toMySQLDate = (input) => {
  const d = new Date(input);
  const pad = (n) => n.toString().padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
};

/* ─── Helper: full image URL ─── */
const bannerURL = (filename, req) =>
  `${req.protocol}://${req.get('host')}/static/banners/${filename}`;

/* ─── CREATE ─── */
router.post('/', upload.single('image'), async (req, res, next) => {
  try {
    const { title, desc, startDate, endDate, active } = req.body;
    const image = req.file?.filename;

    if (!title || !desc || !startDate || !endDate || !image)
      return res.status(400).json({ message: 'All fields are required' });

    const mysqlStart = toMySQLDate(startDate);
    const mysqlEnd = toMySQLDate(endDate);

    await pool.query(
      `INSERT INTO banners (title, \`desc\`, image, startDate, endDate, active)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [title, desc, image, mysqlStart, mysqlEnd, active == '1' ? 1 : 0]
    );

    res.status(201).json({
      message: 'Banner created',
      imageUrl: bannerURL(image, req),
    });
  } catch (e) {
    next(e);
  }
});

/* ─── READ ALL ─── */
router.get('/', async (req, res, next) => {
  try {
    const [rows] = await pool.query('SELECT * FROM banners ORDER BY id DESC');
    const banners = rows.map((b) => ({
      ...b,
      imageUrl: bannerURL(b.image, req),
      active: !!b.active,
    }));
    res.json(banners);
  } catch (e) {
    next(e);
  }
});

/* ─── READ ACTIVE ─── */
router.get('/active', async (req, res, next) => {
  try {
    const [rows] = await pool.query(
      `SELECT id, title, \`desc\` AS description, image, startDate, endDate
         FROM banners
        WHERE active = 1
          AND NOW() >= startDate
          AND NOW() <= endDate
        ORDER BY startDate DESC`
    );

    const result = rows.map(b => ({
      ...b,
      imageUrl: bannerURL(b.image, req)
    }));

    res.json(result);
  } catch (err) {
    next(err);
  }
});

/* ─── UPDATE ─── */
router.put('/:id', upload.single('image'), async (req, res, next) => {
  try {
    const { id } = req.params;
    const { title, desc, startDate, endDate, active } = req.body;
    const file = req.file;

    const [[banner]] = await pool.query('SELECT * FROM banners WHERE id = ?', [id]);
    if (!banner) return res.status(404).json({ message: 'Banner not found' });

    let newImage = banner.image;
    if (file) {
      const oldPath = path.join(__dirname, '..', 'Uploads', 'banners', banner.image);
      if (fs.existsSync(oldPath)) fs.unlinkSync(oldPath);
      newImage = file.filename;
    }

    const mysqlStart = startDate ? toMySQLDate(startDate) : banner.startDate;
    const mysqlEnd = endDate ? toMySQLDate(endDate) : banner.endDate;

    await pool.query(
      `UPDATE banners
       SET title = ?, \`desc\` = ?, image = ?, startDate = ?, endDate = ?, active = ?
       WHERE id = ?`,
      [
        title ?? banner.title,
        desc ?? banner.desc,
        newImage,
        mysqlStart,
        mysqlEnd,
        active == '1' ? 1 : 0,
        id,
      ]
    );

    res.json({
      message: 'Banner updated',
      imageUrl: bannerURL(newImage, req),
    });
  } catch (e) {
    next(e);
  }
});

/* ─── DELETE ─── */
router.delete('/:id', async (req, res, next) => {
  try {
    const { id } = req.params;

    const [[banner]] = await pool.query('SELECT * FROM banners WHERE id = ?', [id]);
    if (!banner) return res.status(404).json({ message: 'Banner not found' });

    const filePath = path.join(__dirname, '..', 'Uploads', 'banners', banner.image);
    if (fs.existsSync(filePath)) fs.unlinkSync(filePath);

    await pool.query('DELETE FROM banners WHERE id = ?', [id]);

    res.json({ message: 'Banner deleted' });
  } catch (e) {
    next(e);
  }
});

module.exports = router;
