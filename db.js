require('dotenv').config();
const mysql = require('mysql2/promise');

// ─── Create MySQL connection pool ───
const pool = mysql.createPool({
  host: process.env.DB_HOST,        // e.g. mysql.railway.internal
  port: process.env.DB_PORT || 3306, // use .env or default MySQL port
  user: process.env.DB_USER,        // e.g. root
  password: process.env.DB_PASSWORD, 
  database: process.env.DB_NAME,    // e.g. railway
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0
});

// ─── Optional: Verify connection on startup ───
(async () => {
  try {
    const conn = await pool.getConnection();
    console.log(`✅ MySQL connected as ${process.env.DB_USER}@${process.env.DB_HOST}/${process.env.DB_NAME}`);
    conn.release();
  } catch (err) {
    console.error('❌ MySQL connection failed:', err.message);
    process.exit(1); // exit app if DB connection fails
  }
})();

module.exports = pool;
