'use strict';

const { v4: uuidv4 } = require('uuid');
const {
  accounts, onlineUsers, rooms,
  avatarColor, sanitize, sysMsg,
  buildRoomList, roomSessions, roomUsers, pushMessage,
} = require('../store');

const VALID_EMOJIS = ['👍','❤️','😂','😮','😢','🔥','🎉','✅','💯','🚀'];

/**
 * Register all Socket.IO event handlers for one connection.
 * @param {import('socket.io').Server} io
 * @param {import('socket.io').Socket} socket
 */
function registerHandlers(io, socket) {
  const { id: userId, username, displayName } = socket.user;
  console.log(`🔌 ${displayName} connected (${socket.id})`);

  // ── Build session and join default room ───────────────────
  const session = {
    id: userId,
    socketId: socket.id,
    username,
    displayName,
    avatar: displayName[0].toUpperCase(),
    avatarColor: avatarColor(username),
    room: 'general',
    status: 'online',
  };

  // Add to online map BEFORE emitting init so counts are accurate
  onlineUsers.set(socket.id, session);
  socket.join('general');

  const account    = accounts.get(username);
  const blockedSet = account?.blocked || new Set();

  // Send full init payload to this client
  socket.emit('init', {
    user:       session,
    blocked:    [...blockedSet],
    activeRoom: 'general',
    rooms: [...rooms.values()].map(r => ({
      id: r.id, name: r.name, icon: r.icon, description: r.description,
      memberCount: roomUsers(r.id).length,     // accurate — session already added
      messages:   r.messages.slice(-50),
    })),
  });

  // Announce join to the room (AFTER emitting init)
  const joinMsg = sysMsg('general', `${displayName} joined the room`);
  pushMessage('general', joinMsg);
  io.to('general').emit('message:new', joinMsg);
  io.to('general').emit('room:users', roomUsers('general'));
  io.emit('rooms:update', buildRoomList());

  // ── room:switch ───────────────────────────────────────────
  socket.on('room:switch', (roomId) => {
    const user = onlineUsers.get(socket.id);
    if (!user || !rooms.has(roomId) || user.room === roomId) return;

    const oldRoom = user.room;

    // Leave old room
    socket.leave(oldRoom);
    user.room = roomId;           // ← update BEFORE filtering so old-room list is accurate

    const leaveMsg = sysMsg(oldRoom, `${user.displayName} left the room`);
    pushMessage(oldRoom, leaveMsg);
    io.to(oldRoom).emit('message:new', leaveMsg);
    io.to(oldRoom).emit('room:users', roomUsers(oldRoom)); // user.room already updated → excluded correctly

    // Join new room
    socket.join(roomId);

    const joinMsg = sysMsg(roomId, `${user.displayName} joined the room`);
    pushMessage(roomId, joinMsg);
    io.to(roomId).emit('message:new', joinMsg);
    io.to(roomId).emit('room:users', roomUsers(roomId));

    // Confirm switch to the switching client — send history + user list
    socket.emit('room:switched', {
      roomId,
      messages: rooms.get(roomId).messages.slice(-50),
      users:    roomUsers(roomId),
    });

    io.emit('rooms:update', buildRoomList());
  });

  // ── message:send ─────────────────────────────────────────
  socket.on('message:send', ({ text, roomId }) => {
    const user = onlineUsers.get(socket.id);
    if (!user) return;

    // BUG FIX: sender must actually be in that room
    if (user.room !== roomId) return;
    if (!rooms.has(roomId)) return;

    const clean = sanitize(text, 2000);
    if (!clean) return;

    const msg = {
      id: uuidv4(),
      type: 'user',
      text: clean,
      roomId,
      author: {
        id:          user.id,
        username:    user.username,
        displayName: user.displayName,
        avatar:      user.avatar,
        avatarColor: user.avatarColor,
      },
      timestamp: new Date().toISOString(),
      reactions: {},
    };

    pushMessage(roomId, msg);

    // Targeted delivery — skip any recipient who has blocked this sender
    for (const [sid, recipient] of roomSessions(roomId)) {
      const recipientAccount = accounts.get(recipient.username);
      if (recipientAccount?.blocked.has(user.username)) continue;
      io.to(sid).emit('message:new', msg);
    }
  });

  // ── typing:start / typing:stop ────────────────────────────
  socket.on('typing:start', ({ roomId }) => {
    const user = onlineUsers.get(socket.id);
    if (!user || user.room !== roomId) return;
    socket.to(roomId).emit('typing:update', {
      userId: user.id, username: user.username, displayName: user.displayName, isTyping: true,
    });
  });

  socket.on('typing:stop', ({ roomId }) => {
    const user = onlineUsers.get(socket.id);
    if (!user) return;
    socket.to(roomId).emit('typing:update', {
      userId: user.id, username: user.username, displayName: user.displayName, isTyping: false,
    });
  });

  // ── message:react ─────────────────────────────────────────
  socket.on('message:react', ({ messageId, roomId, emoji }) => {
    const user = onlineUsers.get(socket.id);
    // BUG FIX: validate user is in this room + whitelist emoji
    if (!user || user.room !== roomId) return;
    if (!VALID_EMOJIS.includes(emoji)) return;

    const room = rooms.get(roomId);
    if (!room) return;
    const msg = room.messages.find(m => m.id === messageId);
    if (!msg) return;

    if (!msg.reactions[emoji]) msg.reactions[emoji] = [];
    const i = msg.reactions[emoji].indexOf(user.id);
    if (i === -1) msg.reactions[emoji].push(user.id);
    else          msg.reactions[emoji].splice(i, 1);
    if (!msg.reactions[emoji].length) delete msg.reactions[emoji];

    io.to(roomId).emit('message:reaction', { messageId, reactions: msg.reactions });
  });

  // ── disconnect ────────────────────────────────────────────
  socket.on('disconnect', () => {
    const user = onlineUsers.get(socket.id);
    if (!user) return;

    const leaveMsg = sysMsg(user.room, `${user.displayName} left the chat`);
    pushMessage(user.room, leaveMsg);
    // Remove from map BEFORE sending room:users so departed user is excluded
    onlineUsers.delete(socket.id);

    io.to(user.room).emit('message:new', leaveMsg);
    io.to(user.room).emit('room:users', roomUsers(user.room));
    io.emit('rooms:update', buildRoomList());
    console.log(`❌ ${user.displayName} disconnected`);
  });
}

module.exports = { registerHandlers };