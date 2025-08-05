const jwt = require('jsonwebtoken');
require('dotenv').config();

module.exports = function authenticateToken(req, res, next) {
  const auth = req.headers['authorization'];
  const token = auth && auth.split(' ')[1];
  if (!token) return res.status(401).json({ message: 'Missing token' });

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    req.user = { id: decoded.id, role: decoded.role }; // adjust to match your JWT payload
    next();
  } catch {
    return res.status(403).json({ message: 'Invalid or expired token' });
  }
};
