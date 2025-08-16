require('dotenv').config();
const mysql = require('mysql2/promise');

// Create MySQL connection pool
const pool = mysql.createPool({
  host: process.env.DB_HOST,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD, // ✅ matches .env
  database: process.env.DB_NAME,
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0
});

// Optional: Check connection at startup
(async () => {
  try {
    const conn = await pool.getConnection();
    console.log('✅ MySQL connected as', process.env.DB_USER, 'to', process.env.DB_NAME);
    conn.release();
  } catch (err) {
    console.error('❌ MySQL connection failed:', err.message);
  }
})();

module.exports = pool;
