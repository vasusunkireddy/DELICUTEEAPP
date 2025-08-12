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
const { broadcastNotification } = require('./utils/push'); // keep your existing util

const PORT = process.env.PORT || 3000;

/* ─── Route imports ─── */
const authRoutes = require('./routes/auth.routes');
const menuRoutes = require('./routes/menu.routes');              // Admin menu (keep)
const ordersRoutes = require('./routes/order.routes');
const myOrdersRoutes = require('./routes/myorders.routes');
const cartRoutes = require('./routes/cart.routes');
const browseRoutes = require('./routes/menubrowse.routes');      // ✅ Customer browse (use this for app)
const addressesRoutes = require('./routes/addresses.routes');
const profileRoutes = require('./routes/profile.route');
const paymentsRoutes = require('./routes/payments.routes');
const customersRoutes = require('./routes/customers.routes');
const bannersRoutes = require('./routes/banners.routes');
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

/* ─── Ensure uploads directories (UNIFIED: lowercase) ─── */
const uploadsBase = path.join(__dirname, 'uploads');
const bannersDir  = path.join(uploadsBase, 'banners');
const avatarsDir  = path.join(uploadsBase, 'avatars');
const messagesDir = path.join(uploadsBase, 'messages');

fs.mkdirSync(bannersDir, { recursive: true });
fs.mkdirSync(avatarsDir, { recursive: true });
fs.mkdirSync(messagesDir, { recursive: true });

console.log('Serving avatars from:', avatarsDir);
console.log('Serving message images from:', messagesDir);

/* ─── Multer setup for chat/profile uploads ─── */
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    if (file.fieldname === 'avatar') return cb(null, avatarsDir);
    if (file.fieldname === 'image')  return cb(null, messagesDir);
    return cb(new Error('Invalid fieldname'), null);
  },
  filename: (req, file, cb) => {
    const unique = Date.now() + '-' + Math.round(Math.random() * 1e9);
    cb(null, `${file.fieldname}_${unique}${path.extname(file.originalname)}`);
  },
});
const fileFilter = (req, file, cb) => {
  const ok = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'].includes(file.mimetype);
  cb(ok ? null : new Error('Only JPEG, PNG, GIF, WebP are allowed'), ok);
};
const upload = multer({ storage, fileFilter, limits: { fileSize: 5 * 1024 * 1024 } });

/* ─── Express app setup ─── */
const app = express();
app.use(cors());
app.use(express.json({ limit: '2mb' }));
app.use(compression());
app.use(morgan('dev'));

/* ─── Static files ─── */
app.use('/static/banners', express.static(bannersDir));
app.use('/uploads/avatars', express.static(avatarsDir));
app.use('/uploads/messages', express.static(messagesDir));
app.use('/uploads', express.static(uploadsBase));

/* ─── Upload endpoint for chat images ─── */
app.post('/upload', upload.single('image'), (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'No file uploaded' });
    const rel = `/uploads/messages/${req.file.filename}`;
    const abs = `${req.protocol}://${req.get('host')}${rel}`;
    console.log('File uploaded:', rel);
    res.json({ url: abs, path: rel });
  } catch (e) {
    console.error('Upload error:', e.message);
    res.status(400).json({ error: e.message });
  }
});

/* ─── API routes (customer uses /api/menubrowse) ─── */
app.use('/api/auth', authRoutes);

/* Customer-facing browse (list + details + add to cart via POST on this router) */
app.use('/api/menubrowse', browseRoutes);  // ✅ primary for the app
app.use('/api/browse', browseRoutes);      // alias (keep if you already use it)

/* Admin menu (keep mounted for admin tools) */
app.use('/api/menu', menuRoutes);

/* Other APIs */
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
app.use('/api/notifications', notificationsRoutes);
app.use('/api/tickets', ticketsRoutes);
app.use('/api/settings', settingsRoutes);
app.use('/api/feedback', feedbackRoutes);
app.use('/api/analytics', analyticsRoutes);
app.use('/api/contactus', contactUsRoutes);
app.use('/api/favorites', favoritesRoutes);
app.use('/api/users', userRoutes);

/* ── TEMP SAFETY NET: redirect old client GETs from /api/menu → /api/menubrowse ──
   (So even if the app accidentally calls /api/menu/:id, it won't 404.) */
app.get('/api/menu', (_req, res) => res.redirect(308, '/api/menubrowse'));
app.get('/api/menu/:id', (req, res) => res.redirect(308, `/api/menubrowse/${req.params.id}`));

/* ─── Health check ─── */
app.get('/', (_req, res) => res.send('✅ Delicute API running'));

/* ─── 404 fallback ─── */
app.use((req, res) => {
  console.log(`404 Error: ${req.method} ${req.originalUrl}`);
  res.status(404).json({ message: '🚫 Endpoint not found' });
});

/* ─── Error handler ─── */
app.use((err, _req, res, _next) => {
  console.error('❌ Unhandled error:', err.stack || err);
  res.status(500).json({ error: '🔥 Internal server error', message: err.message });
});

/* ─── Scheduled task: send due notifications every 2 min ─── */
cron.schedule('*/2 * * * *', async () => {
  try {
    const [due] = await pool.query(
      `SELECT * FROM notifications WHERE sent = 0 AND sendAt <= NOW()`
    );
    for (const n of due) {
      await broadcastNotification(n);
    }
  } catch (e) {
    console.warn('cron push error', e.message);
  }
});

/* ─── Start server ─── */
app.listen(PORT, () =>
  console.log(`🚀 Delicute API running at http://localhost:${PORT}`)
);
