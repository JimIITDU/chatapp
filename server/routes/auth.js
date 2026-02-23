'use strict';

const express   = require('express');
const bcrypt    = require('bcryptjs');
const { v4: uuidv4 } = require('uuid');
const rateLimit = require('express-rate-limit');
const { accounts, sanitize } = require('../store');
const { signToken } = require('../middleware/auth');

const router = express.Router();

const BCRYPT_ROUNDS = 12;
const MAX_ATTEMPTS  = 5;
const LOCKOUT_MS    = 15 * 60 * 1000; // 15 min

function secLog(event, data) {
  console.log(`🛡  [${event}] ${JSON.stringify(data)} — ${new Date().toISOString()}`);
}

function getIp(req) {
  return ((req.headers['x-forwarded-for'] || req.socket.remoteAddress || '').split(',')[0] || 'unknown').trim();
}

// Strict rate limiter: 10 requests / 15 min per IP
const authLimiter = rateLimit({
  windowMs: LOCKOUT_MS, max: 10,
  message: { error: 'Too many attempts. Try again in 15 minutes.' },
  handler(req, res, _next, opts) {
    secLog('RATE_LIMITED', { ip: getIp(req), path: req.path });
    res.status(429).json(opts.message);
  },
  standardHeaders: true,
  legacyHeaders: false,
});

// ── POST /api/register ────────────────────────────────────────
router.post('/register', authLimiter, async (req, res) => {
  try {
    const raw      = sanitize(req.body.username || '', 24);
    const username = raw.toLowerCase();
    const password = sanitize(req.body.password || '', 128);
    const ip       = getIp(req);

    // Validate username
    if (!/^[a-z0-9_]{2,24}$/.test(username))
      return res.status(400).json({ error: 'Username: 2–24 chars, letters/numbers/underscore only.' });

    // Validate password
    if (password.length < 8)
      return res.status(400).json({ error: 'Password must be at least 8 characters.' });
    if (!/[A-Z]/.test(password) || !/[a-z]/.test(password) || !/[0-9]/.test(password))
      return res.status(400).json({ error: 'Password needs uppercase, lowercase, and a number.' });

    if (accounts.has(username))
      return res.status(409).json({ error: 'Username already taken.' });

    const passwordHash = await bcrypt.hash(password, BCRYPT_ROUNDS);
    const account = {
      id: uuidv4(),
      username,
      displayName: raw,           // original casing preserved
      passwordHash,
      createdAt: new Date().toISOString(),
      loginAttempts: 0,
      lockedUntil: null,
      blocked: new Set(),         // Set<username>
    };
    accounts.set(username, account);
    secLog('REGISTER', { username, ip });

    const token = signToken({ id: account.id, username, displayName: raw });
    return res.status(201).json({ token, username, displayName: raw });
  } catch (e) {
    console.error('Register error:', e);
    return res.status(500).json({ error: 'Server error.' });
  }
});

// ── POST /api/login ───────────────────────────────────────────
router.post('/login', authLimiter, async (req, res) => {
  try {
    const username = sanitize(req.body.username || '', 24).toLowerCase();
    const password = sanitize(req.body.password || '', 128);
    const ip       = getIp(req);

    if (!username || !password)
      return res.status(400).json({ error: 'Username and password required.' });

    const account = accounts.get(username);

    // Lockout check (before bcrypt to save CPU)
    if (account?.lockedUntil && Date.now() < account.lockedUntil) {
      const mins = Math.ceil((account.lockedUntil - Date.now()) / 60000);
      secLog('LOGIN_LOCKED', { username, ip });
      return res.status(423).json({ error: `Account locked. Try again in ${mins} minute(s).` });
    }

    // Always run bcrypt — prevents timing-based user enumeration
    const DUMMY_HASH = '$2a$12$invalidhashfortimingnormalizationXXXXXXXXXXXXXXXXXXXXX';
    const ok = await bcrypt.compare(password, account?.passwordHash || DUMMY_HASH);

    if (!account || !ok) {
      if (account) {
        account.loginAttempts = (account.loginAttempts || 0) + 1;
        if (account.loginAttempts >= MAX_ATTEMPTS) {
          account.lockedUntil   = Date.now() + LOCKOUT_MS;
          account.loginAttempts = 0;
          secLog('ACCOUNT_LOCKED', { username, ip });
          return res.status(423).json({ error: 'Too many failed attempts. Account locked for 15 minutes.' });
        }
        const left = MAX_ATTEMPTS - account.loginAttempts;
        secLog('LOGIN_FAIL', { username, ip, attemptsLeft: left });
        return res.status(401).json({ error: `Invalid credentials. ${left} attempt(s) before lockout.` });
      }
      secLog('LOGIN_FAIL_UNKNOWN', { username, ip });
      return res.status(401).json({ error: 'Invalid username or password.' });
    }

    // Success — reset counters
    account.loginAttempts = 0;
    account.lockedUntil   = null;
    secLog('LOGIN_OK', { username, ip });

    const token = signToken({ id: account.id, username, displayName: account.displayName });
    return res.json({ token, username, displayName: account.displayName });
  } catch (e) {
    console.error('Login error:', e);
    return res.status(500).json({ error: 'Server error.' });
  }
});

module.exports = router;