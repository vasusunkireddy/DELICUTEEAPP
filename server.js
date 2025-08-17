require('dotenv').config();
const express = require('express');
const cors = require('cors');
const morgan = require('morgan');
const compression = require('compression');
const path = require('path');
const fs = require('fs');
const cron = require('node-cron');
const multer = require('multer');

const pool = require('./db');
const { broadcastNotification } = require('./utils/push');
const authenticate = require('./middleware/authenticate'); // ✅ add this

const PORT = process.env.PORT || 3000;
const app = express();

const IS_PROD = process.env.NODE_ENV === 'production' || !!process.env.RENDER;

// ───────────────── Upload dirs: use /tmp on Render ─────────────────
const uploadsBase = IS_PROD ? '/tmp/uploads' : path.join(__dirname, 'uploads');
const bannersDir = path.join(uploadsBase, 'banners');
const avatarsDir = path.join(uploadsBase, 'avatars');
const messagesDir = path.join(uploadsBase, 'messages');

[bannersDir, avatarsDir, messagesDir].forEach((dir) => {
  try { fs.mkdirSync(dir, { recursive: true }); } catch {}
});

console.log('📂 uploadsBase:', uploadsBase);
console.log('📂 avatarsDir:', avatarsDir);
console.log('📂 messagesDir:', messagesDir);

// ───────────────── Multer (local disk only; use Cloudinary in routes if you want) ─────────────────
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    if (file.fieldname === 'avatar') return cb(null, avatarsDir);
    if (file.fieldname === 'image') return cb(null, messagesDir);
    return cb(new Error('Invalid fieldname'));
  },
  filename: (_req, file, cb) => {
    const unique = `${Date.now()}-${Math.round(Math.random() * 1e9)}`;
    cb(null, `${file.fieldname}_${unique}${path.extname(file.originalname)}`);
  },
});
const fileFilter = (_req, file, cb) => {
  const ok = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'].includes(file.mimetype);
  cb(ok ? null : new Error('Only JPEG, PNG, GIF, WebP are allowed'), ok);
};
const upload = multer({ storage, fileFilter, limits: { fileSize: 5 * 1024 * 1024 } });

// ───────────────── Core middleware ─────────────────
app.use(cors({ origin: '*'})); // tighten later if needed
app.use(express.json({ limit: '2mb' }));
app.use(express.urlencoded({ extended: true }));
app.use(compression());
app.use(morgan('dev'));

// ───────────────── Static ─────────────────
app.use('/static/banners', express.static(bannersDir));
app.use('/uploads/avatars', express.static(avatarsDir));
app.use('/uploads/messages', express.static(messagesDir));
app.use('/uploads', express.static(uploadsBase));

// ───────────────── Simple upload endpoint (local disk). For prod, prefer Cloudinary in a route. ─────────────────
app.post('/upload', upload.single('image'), (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'No file uploaded' });
    const rel = `/uploads/messages/${req.file.filename}`;
    const abs = `${req.protocol}://${req.get('host')}${rel}`;
    console.log('📤 File uploaded:', rel);
    res.json({ url: abs, path: rel });
  } catch (e) {
    console.error('❌ Upload error:', e.message);
    res.status(400).json({ error: e.message });
  }
});

// ───────────────── Routes (PUBLIC first) ─────────────────
const authRoutes = require('./routes/auth.routes');
const browseRoutes = require('./routes/menubrowse.routes');
const categoriesRoutes = require('./routes/categories.routes');
const bannersRoutes = require('./routes/banners.routes');

// ⚠️ remove /api/menu router because we redirect old paths to menubrowse
// const menuRoutes = require('./routes/menu.routes');

app.use('/api/auth', authRoutes);                   // PUBLIC
app.use('/api/menubrowse', browseRoutes);           // PUBLIC
app.use('/api/browse', browseRoutes);               // alias, PUBLIC
app.use('/api/categories', categoriesRoutes);       // PUBLIC reads; protect writes INSIDE the file
app.use('/api/banners', bannersRoutes);             // PUBLIC reads; protect writes INSIDE the file

// Legacy redirects for /api/menu → /api/menubrowse (must come BEFORE any /api/menu mount)
app.get('/api/menu', (_req, res) => res.redirect(308, '/api/menubrowse'));
app.get('/api/menu/:id', (req, res) => res.redirect(308, `/api/menubrowse/${req.params.id}`));

// ───────────────── Protected routes ─────────────────
const ordersRoutes = require('./routes/order.routes');
const myOrdersRoutes = require('./routes/myorders.routes');
const cartRoutes = require('./routes/cart.routes');
const addressesRoutes = require('./routes/addresses.routes');
const profileRoutes = require('./routes/profile.route');
const paymentsRoutes = require('./routes/payments.routes');
const customersRoutes = require('./routes/customers.routes');
const notificationsRoutes = require('./routes/notifications.routes');
const ticketsRoutes = require('./routes/tickets.routes');
const settingsRoutes = require('./routes/settings.routes');
const feedbackRoutes = require('./routes/feedback.routes');
const analyticsRoutes = require('./routes/analytics.routes');
const couponsRoutes = require('./routes/coupons.routes');
const availableCouponRoutes = require('./routes/availablecoupon.routes');
const contactUsRoutes = require('./routes/contactus.routes');
const customerOrdersRoutes = require('./routes/customerorders.routes');
const favoritesRoutes = require('./routes/favorites.routes');
const userRoutes = require('./routes/user.routes');
const deliveryZonesRoutes = require('./routes/deliveryzones.routes');
const waitlistRoutes = require('./routes/waitlist.routes');

app.use('/api/profile', authenticate, profileRoutes);
app.use('/api/cart', authenticate, cartRoutes);
app.use('/api/orders', authenticate, ordersRoutes);
app.use('/api/myorders', authenticate, myOrdersRoutes);
app.use('/api/customer-orders', authenticate, customerOrdersRoutes);
app.use('/api/payments', authenticate, paymentsRoutes);
app.use('/api/coupons', authenticate, couponsRoutes);
app.use('/api/available-coupons', authenticate, availableCouponRoutes);
app.use('/api/customers', authenticate, customersRoutes);
app.use('/api/notifications', authenticate, notificationsRoutes);
app.use('/api/tickets', authenticate, ticketsRoutes);
app.use('/api/settings', authenticate, settingsRoutes);
app.use('/api/feedback', authenticate, feedbackRoutes);
app.use('/api/analytics', authenticate, analyticsRoutes);
app.use('/api/contactus', authenticate, contactUsRoutes);
app.use('/api/favorites', authenticate, favoritesRoutes);
app.use('/api/users', authenticate, userRoutes);
app.use('/api/zones', authenticate, deliveryZonesRoutes);
app.use('/api/waitlist', authenticate, waitlistRoutes);

// ───────────────── Health ─────────────────
app.get('/', (_req, res) => res.send('✅ Delicute API running'));

// ───────────────── 404 ─────────────────
app.use((req, res) => {
  console.log(`⚠️  404: ${req.method} ${req.originalUrl}`);
  res.status(404).json({ message: '🚫 Endpoint not found' });
});

// ───────────────── Error handler ─────────────────
app.use((err, _req, res, _next) => {
  console.error('🔥 Unhandled error:', err.stack || err);
  res.status(err.status || 500).json({ message: err.message || 'Internal server error' });
});

// ───────────────── Cron (safe) ─────────────────
cron.schedule('*/2 * * * *', async () => {
  try {
    const [due] = await pool.query(
      `SELECT * FROM notifications WHERE sent = 0 AND sendAt <= NOW()`
    );
    for (const n of due) {
      await broadcastNotification(n);
    }
  } catch (e) {
    console.warn('⚠️ Cron push error:', e.message);
  }
});

// ───────────────── Start ─────────────────
app.listen(PORT, () => {
  console.log(`🚀 Delicute API running at http://localhost:${PORT}`);
});
