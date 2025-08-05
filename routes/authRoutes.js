const jwt = require('jsonwebtoken');
require('dotenv').config();

module.exports = function authenticateToken(req, res, next) {
  const auth = req.headers['authorization'];
  const token = auth && auth.split(' ')[1];
  if (!token) return res.sendStatus(401);

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    req.user = { id: decoded.id, role: decoded.role };  // ← must match what you signed
    next();
  } catch {
    return res.sendStatus(403);
  }
};
