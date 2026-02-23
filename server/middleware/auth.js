'use strict';

const jwt = require('jsonwebtoken');

const JWT_SECRET = process.env.JWT_SECRET || (() => {
  const crypto = require('crypto');
  const s = crypto.randomBytes(64).toString('hex');
  console.warn('\n⚠️  JWT_SECRET not set — using a random secret. Sessions reset on restart.');
  console.warn('   Set JWT_SECRET=<long-random-string> in your environment for production.\n');
  return s;
})();

function signToken(payload) {
  return jwt.sign(payload, JWT_SECRET, { expiresIn: '7d' });
}

function verifyToken(token) {
  try { return jwt.verify(token, JWT_SECRET); }
  catch { return null; }
}

/** Express middleware — requires Bearer token */
function requireAuth(req, res, next) {
  const h = req.headers.authorization;
  if (!h?.startsWith('Bearer ')) return res.status(401).json({ error: 'Unauthorized' });
  const payload = verifyToken(h.slice(7));
  if (!payload) return res.status(401).json({ error: 'Invalid or expired token.' });
  req.user = payload;
  next();
}

/** Socket.IO middleware — requires token in handshake.auth */
function socketAuth(socket, next) {
  const token = socket.handshake.auth?.token;
  if (!token) return next(new Error('AUTH_REQUIRED'));
  const payload = verifyToken(token);
  if (!payload) return next(new Error('AUTH_INVALID'));
  socket.user = payload;
  next();
}

module.exports = { JWT_SECRET, signToken, verifyToken, requireAuth, socketAuth };