'use strict';

const express = require('express');
const { accounts, onlineUsers, sanitize } = require('../store');
const { requireAuth } = require('../middleware/auth');

const router = express.Router();

function secLog(event, data) {
  console.log(`🛡  [${event}] ${JSON.stringify(data)} — ${new Date().toISOString()}`);
}

// GET /api/me — verify token and return user info
router.get('/me', requireAuth, (req, res) => {
  res.json({ id: req.user.id, username: req.user.username, displayName: req.user.displayName });
});

// GET /api/blocked — return blocked list
router.get('/blocked', requireAuth, (req, res) => {
  const account = accounts.get(req.user.username);
  if (!account) return res.status(401).json({ error: 'Unauthorized' });
  res.json({ blocked: [...account.blocked] });
});

// POST /api/block
router.post('/block', requireAuth, (req, res) => {
  const target  = sanitize(req.body.username || '', 24).toLowerCase();
  const account = accounts.get(req.user.username);
  if (!account) return res.status(401).json({ error: 'Unauthorized' });
  if (target === req.user.username) return res.status(400).json({ error: "You can't block yourself." });
  if (!accounts.has(target)) return res.status(404).json({ error: 'User not found.' });

  account.blocked.add(target);
  secLog('BLOCK', { by: req.user.username, target });

  // Notify the blocker's own socket so the UI updates immediately
  const sess = [...onlineUsers.values()].find(u => u.username === req.user.username);
  if (sess) {
    // io is attached to the router by index.js
    req.app.get('io').to(sess.socketId).emit('user:blocked', { username: target });
  }

  res.json({ success: true, blocked: target });
});

// POST /api/unblock
router.post('/unblock', requireAuth, (req, res) => {
  const target  = sanitize(req.body.username || '', 24).toLowerCase();
  const account = accounts.get(req.user.username);
  if (!account) return res.status(401).json({ error: 'Unauthorized' });

  account.blocked.delete(target);
  secLog('UNBLOCK', { by: req.user.username, target });

  const sess = [...onlineUsers.values()].find(u => u.username === req.user.username);
  if (sess) {
    req.app.get('io').to(sess.socketId).emit('user:unblocked', { username: target });
  }

  res.json({ success: true, unblocked: target });
});

module.exports = router;