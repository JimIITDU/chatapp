'use strict';

const express = require('express');
const http    = require('http');
const { Server } = require('socket.io');
const path    = require('path');
const helmet  = require('helmet');

const authRoutes  = require('./routes/auth');
const userRoutes  = require('./routes/users');
const { socketAuth } = require('./middleware/auth');
const { registerHandlers } = require('./socket/handlers');

const PORT = process.env.PORT || 3000;

// ─── Express ─────────────────────────────────────────────────
const app    = express();
const server = http.createServer(app);

// Security headers
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc:  ["'self'", "'unsafe-inline'"],
      styleSrc:   ["'self'", "'unsafe-inline'", 'https://fonts.googleapis.com'],
      fontSrc:    ["'self'", 'https://fonts.gstatic.com'],
      connectSrc: ["'self'", 'ws:', 'wss:'],
      imgSrc:     ["'self'", 'data:'],
    },
  },
}));

app.use(express.json({ limit: '10kb' }));
app.use(express.static(path.join(__dirname, '../client')));

// ─── Routes ──────────────────────────────────────────────────
app.use('/api', authRoutes);
app.use('/api', userRoutes);

// ─── Socket.IO ───────────────────────────────────────────────
const io = new Server(server, { cors: { origin: false } });

// Attach io to app so routes can emit events (e.g. block/unblock)
app.set('io', io);

// Auth middleware — every socket must present a valid JWT
io.use(socketAuth);

io.on('connection', (socket) => {
  registerHandlers(io, socket);
});

// ─── Start ───────────────────────────────────────────────────
server.listen(PORT, () => {
  console.log(`\n🚀 ChatApp v3 → http://localhost:${PORT}`);
  console.log(`🔒 bcrypt(12) · JWT · Rate limiting · Account lockout · Block system\n`);
});