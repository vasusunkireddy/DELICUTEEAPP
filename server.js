require('dotenv').config();
const express = require('express');
const cors = require('cors');
const morgan = require('morgan');
const compression = require('compression');
const helmet = require('helmet');
const path = require('path');
const fs = require('fs');
const cron = require('node-cron');
const multer = require('multer');

const pool = require('./db'); // ✅ DB connection pool
const { broadcastNotification } = require('./utils/push');

const PORT = process.env.PORT || 3000;
const app = express();

/* ─── Render / Proxy ─── */
app.set('trust proxy', 1);

/* ─── Route imports ─── */
const authRoutes = require('./routes/auth.routes');
const menuRoutes = require('./routes/menu.routes');              // admin CRUD for menu
const ordersRoutes = require('./routes/order.routes');
const myOrdersRoutes = require('./routes/myorders.routes');
const cartRoutes = require('./routes/cart.routes');
const browseRoutes = require('./routes/menubrowse.routes');
const addressesRoutes = require('./routes/addresses.routes');
const profileRoutes = require('./routes/profile.route');
const paymentsRoutes = require('./routes/payments.routes');
const customersRoutes = require('./routes/customers.routes');
const bannersRoutes = require('./routes/banners.routes');
const notificationsRoutes = require('./routes/notifications.routes'); // ✅ corrected below
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
const categoriesRoutes = require('./routes/categories.routes');
const deliveryZonesRoutes = require('./routes/deliveryzones.routes'); // ⬅️ has POST /check
const waitlistRoutes = require('./routes/waitlist.routes');
const chatRoutes = require('./routes/chat.routes');

/* ─── Ensure uploads directories ─── */
const uploadsBase = path.join(__dirname, 'uploads');
const bannersDir = path.join(uploadsBase, 'banners');
const avatarsDir = path.join(uploadsBase, 'avatars');
const messagesDir = path.join(uploadsBase, 'messages');
[bannersDir, avatarsDir, messagesDir].forEach((dir) => fs.mkdirSync(dir, { recursive: true }));

console.log('📂 Serving banners from:', bannersDir);
console.log('📂 Serving avatars from:', avatarsDir);
console.log('📂 Serving message images from:', messagesDir);

/* ─── Multer for chat/profile uploads ─── */
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

/* ─── CORS ─── */
const PROD_ORIGIN = 'https://delicuteeapp.onrender.com'; // verify this is your real host
const corsOptions = {
  origin: (origin, cb) => {
    const allowed =
      !origin ||
      origin === PROD_ORIGIN ||
      /^http:\/\/localhost:(1900\d|8081|3000)$/.test(origin) ||
      /^http:\/\/192\.168\.\d{1,3}\.\d{1,3}(:\d+)?$/.test(origin);
    cb(null, allowed);
  },
  credentials: true,
};
app.use(cors(corsOptions));

/* ─── Core middleware ─── */
app.use(helmet({ crossOriginResourcePolicy: false }));
app.use(compression());
app.use(express.json({ limit: '2mb' }));
app.use(express.urlencoded({ extended: true, limit: '2mb' }));
app.use(morgan('dev'));

/* ─── Health ─── */
app.get('/', (_req, res) => res.status(200).json({ ok: true, service: 'delicute' }));
app.get('/api', (_req, res) => res.status(200).json({ ok: true, api: 'v1' }));

/* ─── Static files ─── */
app.use('/static/banners', express.static(bannersDir));
app.use('/uploads/avatars', express.static(avatarsDir));
app.use('/uploads/messages', express.static(messagesDir));
app.use('/uploads', express.static(uploadsBase));

/* ─── Public chat upload endpoint ─── */
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

/* ─── API Routes ─── */
/* PUBLIC-FIRST: put zones + waitlist before anything that could intercept */
app.use('/api/zones', deliveryZonesRoutes);       
app.use('/api/waitlist', waitlistRoutes);         

/* General public + auth-mixed routes */
app.use('/api/auth', authRoutes);
app.use('/api/menubrowse', browseRoutes);
app.use('/api/browse', browseRoutes);
app.use('/api/categories', categoriesRoutes);
app.use('/api/addresses', addressesRoutes);
app.use('/api/profile', profileRoutes);
app.use('/api/cart', cartRoutes);
app.use('/api/orders', ordersRoutes);
app.use('/api/myorders', myOrdersRoutes);
app.use('/api/customer-orders', customerOrdersRoutes);
app.use('/api/payments', paymentsRoutes);
app.use('/api/coupons', couponsRoutes);
app.use('/api/available-coupons', availableCouponRoutes);
app.use('/api/customers', customersRoutes);
app.use('/api/banners', bannersRoutes);
app.use('/api/tickets', ticketsRoutes);
app.use('/api/settings', settingsRoutes);
app.use('/api/feedback', feedbackRoutes);
app.use('/api/analytics', analyticsRoutes);
app.use('/api/contactus', contactUsRoutes);
app.use('/api/favorites', favoritesRoutes);
app.use('/api/users', userRoutes);
app.use('/api/chat', chatRoutes);

/* ✅ FIXED: mount notifications at /api (not /api/notifications) */
app.use('/api', notificationsRoutes);

/* Admin menu CRUD under /api/menu-admin */
app.use('/api/menu-admin', menuRoutes);

/* Legacy redirect for menu */
app.get('/api/menu', (_req, res) => res.redirect(308, '/api/menubrowse'));
app.get('/api/menu/:id', (req, res) =>
  res.redirect(308, `/api/menubrowse/${encodeURIComponent(req.params.id)}`)
);

/* ─── 404 ─── */
app.use((req, res) => {
  console.log(`⚠️  404: ${req.method} ${req.originalUrl}`);
  res.status(404).json({ message: '🚫 Endpoint not found' });
});

/* ─── Error handler ─── */
app.use((err, _req, res, _next) => {
  console.error('🔥 Unhandled error:', err.stack || err);
  res.status(err.status || 500).json({
    error: 'Internal server error',
    message: process.env.NODE_ENV === 'production' ? undefined : err.message,
  });
});

/* ─── Cron for scheduled notifications ─── */
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

/* ─── Start ─── */
app.listen(PORT, () => {
  console.log(`🚀 Delicute API running at http://localhost:${PORT}`);
});
