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
const { initRoomPasswords } = require('./store');

const PORT = process.env.PORT || 3000;

const app    = express();
const server = http.createServer(app);

app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc:  ["'self'", "'unsafe-inline'", "'unsafe-hashes'"],
      scriptSrcAttr: ["'unsafe-inline'"],
      styleSrc:   ["'self'", "'unsafe-inline'", 'https://fonts.googleapis.com'],
      fontSrc:    ["'self'", 'https://fonts.gstatic.com'],
      connectSrc: ["'self'", 'ws:', 'wss:'],
      imgSrc:     ["'self'", 'data:'],
    },
  },
}));

app.use(express.json({ limit: '10kb' }));
app.use(express.static(path.join(__dirname, '../client')));

app.use('/api', authRoutes);
app.use('/api', userRoutes);

const io = new Server(server, { cors: { origin: false } });
app.set('io', io);
io.use(socketAuth);
io.on('connection', (socket) => registerHandlers(io, socket));

// Hash room passwords before accepting connections
initRoomPasswords().then(() => {
  server.listen(PORT, () => {
    console.log(`\n🚀 ChatApp v4 → http://localhost:${PORT}`);
    console.log(`🔒 Room passwords active · Last 20 msg history · DM block system\n`);
    console.log('Room passwords:');
    console.log('  #general → general123');
    console.log('  #tech    → tech456');
    console.log('  #random  → random789');
    console.log('  #gaming  → gaming000\n');
  });
});