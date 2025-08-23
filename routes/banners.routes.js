const express = require('express');
const multer = require('multer');
const dayjs = require('dayjs');
const sanitizeHtml = require('sanitize-html');
const pool = require('../db');
const cloudinary = require('cloudinary').v2;
const sharp = require('sharp');
const ffmpeg = require('fluent-ffmpeg');
const { Readable } = require('stream');
const path = require('path');
const fs = require('fs');

const router = express.Router();

/* ── Cloudinary Configuration ── */
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

/* ── Multer: Store in memory, limit file size, basic validation ── */
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 50 * 1024 * 1024 }, // up to 50MB for videos
  fileFilter: (req, file, cb) => {
    if (
      file.mimetype.startsWith('image/') ||
      file.mimetype === 'video/mp4'
    ) {
      cb(null, true);
    } else {
      cb(new Error('Only image or MP4 video files are allowed'), false);
    }
  },
});

/* ── Banner Dimensions (based on client width ~390px) ── */
const TARGET_WIDTH = 366; // width - 24
const TARGET_HEIGHT = 220; // (width - 24) * 0.6

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

const validateBanner = (title, desc, startDate, endDate, url, mediaType) => {
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
  if (mediaType && !['image', 'video'].includes(mediaType)) {
    throw new Error('Invalid media type; must be "image" or "video"');
  }
};

/* ── Process Image with Sharp ── */
const processImage = async (buffer) => {
  try {
    return await sharp(buffer)
      .resize({
        width: TARGET_WIDTH,
        height: TARGET_HEIGHT,
        fit: 'cover',
        position: 'center',
      })
      .jpeg({ quality: 85 })
      .toBuffer();
  } catch (err) {
    console.error('Image processing error:', err);
    throw new Error('Failed to process image');
  }
};

/* ── Process Video with FFmpeg ── */
const processVideo = (buffer) => {
  return new Promise((resolve, reject) => {
    if (!buffer || buffer.length === 0) {
      return reject(new Error('Video buffer is empty or invalid'));
    }

    console.log(`Processing video, buffer size: ${buffer.length} bytes`);
    const inputPath = path.join(__dirname, `tmp-${Date.now()}.mp4`);
    const outputPath = path.join(__dirname, `out-${Date.now()}.mp4`);

    // Write buffer to tmp file
    fs.writeFileSync(inputPath, buffer);

    ffmpeg(inputPath)
      .outputOptions([
        `-vf scale=${TARGET_WIDTH}:${TARGET_HEIGHT}:force_original_aspect_ratio=decrease,pad=${TARGET_WIDTH}:${TARGET_HEIGHT}:(ow-iw)/2:(oh-ih)/2`,
        '-c:v libx264',
        '-c:a aac',
        '-b:v 2000k',
        '-r 30',
      ])
      .toFormat('mp4')
      .on('error', (err) => {
        console.error('FFmpeg processing error:', err);
        fs.unlinkSync(inputPath);
        reject(new Error(`Video processing failed: ${err.message}`));
      })
      .on('end', () => {
        console.log('Video processing completed');
        const processedBuffer = fs.readFileSync(outputPath);
        fs.unlinkSync(inputPath);
        fs.unlinkSync(outputPath);
        resolve(processedBuffer);
      })
      .save(outputPath);
  });
};

/* ── CREATE ── */
router.post('/', upload.single('media'), async (req, res) => {
  try {
    const title = clean(req.body.title);
    const desc = clean(req.body.desc || req.body.description);
    const url = req.body.url ? clean(req.body.url) : null;
    const startDate = toMySQLDate(req.body.startDate);
    const endDate = toMySQLDate(req.body.endDate);
    const active = bool01(req.body.active, 1);
    const mediaType = req.body.mediaType || 'image';

    validateBanner(title, desc, startDate, endDate, url, mediaType);
    if (!req.file) {
      return res.status(400).json({ message: 'Media file is required' });
    }

    const resourceType = req.file.mimetype.startsWith('video/') ? 'video' : 'image';
    let processedBuffer;

    if (resourceType === 'image') {
      processedBuffer = await processImage(req.file.buffer);
    } else {
      processedBuffer = await processVideo(req.file.buffer);
    }

    // Upload to Cloudinary
    const result = await new Promise((resolve, reject) => {
      const stream = cloudinary.uploader.upload_stream(
        { folder: 'delicute/banners', resource_type: resourceType },
        (error, result) => {
          if (error) reject(error);
          else resolve(result);
        }
      );
      stream.end(processedBuffer);
    });

    const mediaUrl = result.secure_url;
    const publicId = result.public_id;

    // Insert into database
    const [dbResult] = await pool.query(
      `INSERT INTO banners (title, \`desc\`, mediaUrl, media_public_id, mediaType, url, startDate, endDate, active)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [title, desc, mediaUrl, publicId, mediaType, url, startDate, endDate, active]
    );

    res.status(201).json({
      message: 'Banner created',
      id: dbResult.insertId,
      title,
      desc,
      url,
      mediaUrl,
      mediaType,
      startDate,
      endDate,
      active: !!active,
    });
  } catch (e) {
    console.error('POST /banners error:', e);
    res.status(400).json({ message: e.message || 'Failed to create banner' });
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
      description: b.desc,
      url: b.url,
      mediaUrl: b.mediaUrl,
      mediaType: b.mediaType || 'image',
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
      `SELECT id, title, \`desc\` AS description, mediaUrl, mediaType, url, startDate, endDate, active
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
router.put('/:id', upload.single('media'), async (req, res) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id <= 0) {
      return res.status(400).json({ message: 'Invalid banner ID' });
    }

    const [[existing]] = await pool.query('SELECT * FROM banners WHERE id = ?', [id]);
    if (!existing) {
      return res.status(404).json({ message: 'Banner not found' });
    }

    const title = req.body.title != null ? clean(req.body.title) : existing.title;
    const desc = req.body.desc != null ? clean(req.body.desc || req.body.description) : existing.desc;
    const url = req.body.url != null ? clean(req.body.url) : existing.url;
    const startDate = req.body.startDate ? toMySQLDate(req.body.startDate) : existing.startDate;
    const endDate = req.body.endDate ? toMySQLDate(req.body.endDate) : existing.endDate;
    const active = req.body.active != null ? bool01(req.body.active, existing.active) : existing.active;
    const mediaType = req.body.mediaType || existing.mediaType || 'image';

    validateBanner(title, desc, startDate, endDate, url, mediaType);

    let mediaUrl = existing.mediaUrl;
    let publicId = existing.media_public_id;

    if (req.file) {
      const resourceType = req.file.mimetype.startsWith('video/') ? 'video' : 'image';
      let processedBuffer;

      if (resourceType === 'image') {
        processedBuffer = await processImage(req.file.buffer);
      } else {
        processedBuffer = await processVideo(req.file.buffer);
      }

      const result = await new Promise((resolve, reject) => {
        const stream = cloudinary.uploader.upload_stream(
          { folder: 'delicute/banners', resource_type: resourceType },
          (error, result) => {
            if (error) reject(error);
            else resolve(result);
          }
        );
        stream.end(processedBuffer);
      });

      mediaUrl = result.secure_url;
      publicId = result.public_id;

      if (existing.media_public_id) {
        try {
          await cloudinary.uploader.destroy(existing.media_public_id, {
            resource_type: existing.mediaType === 'video' ? 'video' : 'image',
          });
        } catch (e) {
          console.warn('Failed to delete old Cloudinary media:', e.message);
        }
      }
    }

    const [dbResult] = await pool.query(
      `UPDATE banners
       SET title = ?, \`desc\` = ?, mediaUrl = ?, media_public_id = ?, mediaType = ?, url = ?, startDate = ?, endDate = ?, active = ?
       WHERE id = ?`,
      [title, desc, mediaUrl, publicId, mediaType, url, startDate, endDate, active, id]
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
      mediaUrl,
      mediaType,
      startDate,
      endDate,
      active: !!active,
    });
  } catch (e) {
    console.error('PUT /banners/:id error:', e);
    res.status(400).json({ message: e.message || 'Failed to update banner' });
  }
});

/* ── DELETE ── */
router.delete('/:id', async (req, res) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id <= 0) {
      return res.status(400).json({ message: 'Invalid banner ID' });
    }

    const [[existing]] = await pool.query('SELECT media_public_id, mediaType FROM banners WHERE id = ?', [id]);
    if (!existing) {
      return res.status(404).json({ message: 'Banner not found' });
    }

    const [dbResult] = await pool.query('DELETE FROM banners WHERE id = ?', [id]);
    if (dbResult.affectedRows === 0) {
      return res.status(404).json({ message: 'Banner not found' });
    }

    if (existing.media_public_id) {
      try {
        await cloudinary.uploader.destroy(existing.media_public_id, {
          resource_type: existing.mediaType === 'video' ? 'video' : 'image',
        });
      } catch (e) {
        console.warn('Failed to delete Cloudinary media:', e.message);
      }
    }

    res.json({ message: 'Banner deleted' });
  } catch (e) {
    console.error('DELETE /banners/:id error:', e);
    res.status(500).json({ message: 'Failed to delete banner' });
  }
});

module.exports = router;
