const express = require('express');
const multer = require('multer');
const dayjs = require('dayjs');
const sanitizeHtml = require('sanitize-html');
const pool = require('../db');
const cloudinary = require('cloudinary').v2;
const sharp = require('sharp');
const ffmpeg = require('fluent-ffmpeg');
const ffprobe = require('fluent-ffmpeg').ffprobe;
const { Readable } = require('stream');
const path = require('path');
const fs = require('fs').promises;

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
  limits: { fileSize: 100 * 1024 * 1024 }, // Increased to 100MB for HD videos
  fileFilter: (req, file, cb) => {
    const validImageTypes = ['image/jpeg', 'image/png'];
    const validVideoTypes = ['video/mp4'];
    if (validImageTypes.includes(file.mimetype) || validVideoTypes.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error('Only JPEG, PNG images, or MP4 videos are allowed'), false);
    }
  },
});

/* ── Constants ── */
const MIN_WIDTH = 1920; // Minimum HD width
const MIN_HEIGHT = 1080; // Minimum HD height
const TARGET_ASPECT_RATIO = 16 / 9;
const THUMBNAIL_WIDTH = 366; // For admin dashboard previews
const THUMBNAIL_HEIGHT = 220;

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

/* ── Validate Image Resolution and Aspect Ratio ── */
const validateImage = async (buffer) => {
  try {
    const metadata = await sharp(buffer).metadata();
    if (metadata.width < MIN_WIDTH || metadata.height < MIN_HEIGHT) {
      throw new Error(`Image resolution must be at least ${MIN_WIDTH}x${MIN_HEIGHT}`);
    }
    const aspectRatio = metadata.width / metadata.height;
    if (Math.abs(aspectRatio - TARGET_ASPECT_RATIO) > 0.1) {
      throw new Error('Image must have a 16:9 aspect ratio');
    }
    return metadata;
  } catch (err) {
    throw new Error(`Image validation failed: ${err.message}`);
  }
};

/* ── Validate Video Resolution and Aspect Ratio ── */
const validateVideo = async (buffer) => {
  try {
    const tempPath = path.join(__dirname, `tmp-${Date.now()}.mp4`);
    await fs.writeFile(tempPath, buffer);
    const metadata = await new Promise((resolve, reject) => {
      ffprobe(tempPath, (err, data) => {
        if (err) reject(err);
        else resolve(data);
      });
    });
    await fs.unlink(tempPath);
    const videoStream = metadata.streams.find(s => s.codec_type === 'video');
    if (!videoStream) {
      throw new Error('No video stream found');
    }
    const { width, height } = videoStream;
    if (width < MIN_WIDTH || height < MIN_HEIGHT) {
      throw new Error(`Video resolution must be at least ${MIN_WIDTH}x${MIN_HEIGHT}`);
    }
    const aspectRatio = width / height;
    if (Math.abs(aspectRatio - TARGET_ASPECT_RATIO) > 0.1) {
      throw new Error('Video must have a 16:9 aspect ratio');
    }
    return { width, height };
  } catch (err) {
    throw new Error(`Video validation failed: ${err.message}`);
  }
};

/* ── Create Thumbnail for Image ── */
const createImageThumbnail = async (buffer) => {
  try {
    return await sharp(buffer)
      .resize({
        width: THUMBNAIL_WIDTH,
        height: THUMBNAIL_HEIGHT,
        fit: 'cover',
        position: 'center',
      })
      .jpeg({ quality: 85 })
      .toBuffer();
  } catch (err) {
    console.error('Image thumbnail creation error:', err);
    throw new Error('Failed to create image thumbnail');
  }
};

/* ── Create Thumbnail for Video ── */
const createVideoThumbnail = async (buffer) => {
  try {
    const tempInput = path.join(__dirname, `tmp-vid-${Date.now()}.mp4`);
    const tempOutput = path.join(__dirname, `tmp-thumb-${Date.now()}.jpg`);
    await fs.writeFile(tempInput, buffer);
    await new Promise((resolve, reject) => {
      ffmpeg(tempInput)
        .screenshots({
          count: 1,
          folder: __dirname,
          filename: path.basename(tempOutput),
          size: `${THUMBNAIL_WIDTH}x${THUMBNAIL_HEIGHT}`,
        })
        .on('end', resolve)
        .on('error', reject);
    });
    const thumbnailBuffer = await fs.readFile(tempOutput);
    await fs.unlink(tempInput);
    await fs.unlink(tempOutput);
    return thumbnailBuffer;
  } catch (err) {
    console.error('Video thumbnail creation error:', err);
    throw new Error('Failed to create video thumbnail');
  }
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
    await (resourceType === 'image' ? validateImage : validateVideo)(req.file.buffer);

    // Upload original media to Cloudinary
    const uploadResult = await new Promise((resolve, reject) => {
      const stream = cloudinary.uploader.upload_stream(
        { folder: 'delicute/banners', resource_type: resourceType },
        (error, result) => {
          if (error) reject(error);
          else resolve(result);
        }
      );
      Readable.from(req.file.buffer).pipe(stream);
    });

    // Create and upload thumbnail
    const thumbnailBuffer = await (resourceType === 'image'
      ? createImageThumbnail(req.file.buffer)
      : createVideoThumbnail(req.file.buffer));
    const thumbnailResult = await new Promise((resolve, reject) => {
      const stream = cloudinary.uploader.upload_stream(
        { folder: 'delicute/banners/thumbnails', resource_type: 'image' },
        (error, result) => {
          if (error) reject(error);
          else resolve(result);
        }
      );
      Readable.from(thumbnailBuffer).pipe(stream);
    });

    const mediaUrl = uploadResult.secure_url;
    const mediaPublicId = uploadResult.public_id;
    const thumbnailUrl = thumbnailResult.secure_url;
    const thumbnailPublicId = thumbnailResult.public_id;

    // Insert into database
    const [dbResult] = await pool.query(
      `INSERT INTO banners (title, \`desc\`, mediaUrl, media_public_id, thumbnailUrl, thumbnail_public_id, mediaType, url, startDate, endDate, active)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [title, desc, mediaUrl, mediaPublicId, thumbnailUrl, thumbnailPublicId, mediaType, url, startDate, endDate, active]
    );

    res.status(201).json({
      message: 'Banner created',
      id: dbResult.insertId,
      title,
      desc,
      url,
      mediaUrl,
      thumbnailUrl,
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
      thumbnailUrl: b.thumbnailUrl,
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
      `SELECT id, title, \`desc\` AS description, mediaUrl, thumbnailUrl, mediaType, url, startDate, endDate, active
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
    let mediaPublicId = existing.media_public_id;
    let thumbnailUrl = existing.thumbnailUrl;
    let thumbnailPublicId = existing.thumbnail_public_id;

    if (req.file) {
      const resourceType = req.file.mimetype.startsWith('video/') ? 'video' : 'image';
      await (resourceType === 'image' ? validateImage : validateVideo)(req.file.buffer);

      const uploadResult = await new Promise((resolve, reject) => {
        const stream = cloudinary.uploader.upload_stream(
          { folder: 'delicute/banners', resource_type: resourceType },
          (error, result) => {
            if (error) reject(error);
            else resolve(result);
          }
        );
        Readable.from(req.file.buffer).pipe(stream);
      });

      const thumbnailBuffer = await (resourceType === 'image'
        ? createImageThumbnail(req.file.buffer)
        : createVideoThumbnail(req.file.buffer));
      const thumbnailResult = await new Promise((resolve, reject) => {
        const stream = cloudinary.uploader.upload_stream(
          { folder: 'delicute/banners/thumbnails', resource_type: 'image' },
          (error, result) => {
            if (error) reject(error);
            else resolve(result);
          }
        );
        Readable.from(thumbnailBuffer).pipe(stream);
      });

      mediaUrl = uploadResult.secure_url;
      mediaPublicId = uploadResult.public_id;
      thumbnailUrl = thumbnailResult.secure_url;
      thumbnailPublicId = thumbnailResult.public_id;

      if (existing.media_public_id) {
        try {
          await cloudinary.uploader.destroy(existing.media_public_id, {
            resource_type: existing.mediaType === 'video' ? 'video' : 'image',
          });
        } catch (e) {
          console.warn('Failed to delete old Cloudinary media:', e.message);
        }
      }
      if (existing.thumbnail_public_id) {
        try {
          await cloudinary.uploader.destroy(existing.thumbnail_public_id, {
            resource_type: 'image',
          });
        } catch (e) {
          console.warn('Failed to delete old Cloudinary thumbnail:', e.message);
        }
      }
    }

    const [dbResult] = await pool.query(
      `UPDATE banners
       SET title = ?, \`desc\` = ?, mediaUrl = ?, media_public_id = ?, thumbnailUrl = ?, thumbnail_public_id = ?, mediaType = ?, url = ?, startDate = ?, endDate = ?, active = ?
       WHERE id = ?`,
      [title, desc, mediaUrl, mediaPublicId, thumbnailUrl, thumbnailPublicId, mediaType, url, startDate, endDate, active, id]
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
      thumbnailUrl,
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

    const [[existing]] = await pool.query('SELECT media_public_id, thumbnail_public_id, mediaType FROM banners WHERE id = ?', [id]);
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
    if (existing.thumbnail_public_id) {
      try {
        await cloudinary.uploader.destroy(existing.thumbnail_public_id, {
          resource_type: 'image',
        });
      } catch (e) {
        console.warn('Failed to delete Cloudinary thumbnail:', e.message);
      }
    }

    res.json({ message: 'Banner deleted' });
  } catch (e) {
    console.error('DELETE /banners/:id error:', e);
    res.status(500).json({ message: 'Failed to delete banner' });
  }
});

module.exports = router;