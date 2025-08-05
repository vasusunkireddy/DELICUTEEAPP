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
const { broadcastNotification } = require('../utils/push');

const PORT = process.env.PORT || 3000;

/* ─── Route imports ─── */
const authRoutes = require('./routes/auth.routes');
const menuRoutes = require('./routes/menu.routes');
const ordersRoutes = require('./routes/order.routes');
const myOrdersRoutes = require('./routes/myorders.routes');
const cartRoutes = require('./routes/cart.routes');
const browseRoutes = require('./routes/menubrowse.routes');
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

/* ─── Ensure uploads directories ─── */
const bannersDir = path.join(__dirname, 'uploads', 'banners');
fs.mkdirSync(bannersDir, { recursive: true });

const avatarsDir = path.join(__dirname, 'Uploads', 'avatars');
fs.mkdirSync(avatarsDir, { recursive: true });

const messagesDir = path.join(__dirname, 'Uploads', 'messages');
fs.mkdirSync(messagesDir, { recursive: true });

console.log('Serving avatars from:', avatarsDir);
console.log('Serving message images from:', messagesDir);

/* ─── Multer setup for file uploads ─── */
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    if (file.fieldname === 'avatar') {
      cb(null, avatarsDir);
    } else if (file.fieldname === 'image') {
      cb(null, messagesDir);
    } else {
      cb(new Error('Invalid fieldname'), null);
    }
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, `${file.fieldname}_${uniqueSuffix}${path.extname(file.originalname)}`);
  },
});

const fileFilter = (req, file, cb) => {
  const allowedTypes = ['image/jpeg', 'image/png', 'image/gif'];
  if (allowedTypes.includes(file.mimetype)) {
    cb(null, true);
  } else {
    cb(new Error('Only JPEG, PNG, and GIF images are allowed'), false);
  }
};

const upload = multer({
  storage,
  fileFilter,
  limits: { fileSize: 5 * 1024 * 1024 }, // 5MB limit
});

/* ─── Express app setup ─── */
const app = express();
app.use(cors());
app.use(express.json());
app.use(compression());
app.use(morgan('dev'));

/* ─── Static files ─── */
app.use('/static/banners', express.static(bannersDir));
app.use('/uploads/avatars', express.static(avatarsDir));
app.use('/uploads/messages', express.static(messagesDir));
app.use('/uploads', express.static(path.join(__dirname, 'Uploads')));

/* ─── Upload endpoint for chat images ─── */
app.post('/upload', upload.single('image'), (req, res) => {
  try {
    if (!req.file) {
      console.log('Upload failed: No file provided');
      return res.status(400).json({ error: 'No file uploaded' });
    }
    const imageUrl = `/uploads/messages/${req.file.filename}`;
    console.log('File uploaded successfully:', imageUrl);
    res.json({ url: imageUrl });
  } catch (e) {
    console.error('Upload error:', e.message);
    res.status(400).json({ error: e.message });
  }
});

/* ─── API routes ─── */
app.use('/api/auth', authRoutes);
app.use('/api/browse', browseRoutes);
app.use('/api/menubrowse', browseRoutes);
app.use('/api/addresses', addressesRoutes);
app.use('/api/profile', profileRoutes);
app.use('/api/cart', cartRoutes);
app.use('/api/menu', menuRoutes);
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

/* ─── Health check ─── */
app.get('/', (_req, res) => res.send('✅ Delicute API running'));

/* ─── 404 fallback ─── */
app.use((req, res) => {
  console.log(`404 Error: ${req.method} ${req.originalUrl}`);
  res.status(404).json({ message: '🚫 Endpoint not found' });
});

/* ─── Error handler ─── */
app.use((err, _req, res, _next) => {
  console.error('❌ Unhandled error:', err.stack);
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