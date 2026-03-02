'use strict';
const { v4: uuidv4 } = require('uuid');
const {
  accounts, onlineUsers, rooms,
  getDmHistory, pushDm,
  avatarColor, sanitize, sysMsg,
  buildRoomList, roomSessions, roomUsers, pushMessage,
  verifyRoomPassword, getSession,
} = require('../store');

const VALID_EMOJIS = ['👍','❤️','😂','😮','😢','🔥','🎉','✅','💯','🚀'];

function registerHandlers(io, socket) {
  const { id: userId, username, displayName } = socket.user;
  console.log(`🔌 ${displayName} connected`);

  const session = {
    id: userId, socketId: socket.id,
    username, displayName,
    avatar: displayName[0].toUpperCase(),
    avatarColor: avatarColor(username),
    room: null, status: 'online',
    unlockedRooms: new Set(),
  };
  onlineUsers.set(socket.id, session);

  const account   = accounts.get(username);
  const blockedSet = account?.blocked || new Set();

  socket.emit('init', {
    user:    session,
    blocked: [...blockedSet],
    rooms:   buildRoomList(),
  });

  // Notify contacts this user came online
  io.emit('user:online', { username, displayName, avatarColor: session.avatarColor, avatar: session.avatar });

  // ── room:unlock ──────────────────────────────────────────
  socket.on('room:unlock', async ({ roomId, password }) => {
    const user = onlineUsers.get(socket.id);
    if (!user || !rooms.has(roomId))
      return socket.emit('room:unlock:result', { roomId, success: false, error: 'Room not found.' });
    if (user.unlockedRooms.has(roomId))
      return doSwitchRoom(io, socket, user, roomId);

    const ok = await verifyRoomPassword(roomId, sanitize(password, 128));
    if (!ok) return socket.emit('room:unlock:result', { roomId, success: false, error: 'Wrong password.' });

    user.unlockedRooms.add(roomId);
    socket.emit('room:unlock:result', { roomId, success: true });
    doSwitchRoom(io, socket, user, roomId);
  });

  // ── room:switch ──────────────────────────────────────────
  socket.on('room:switch', (roomId) => {
    const user = onlineUsers.get(socket.id);
    if (!user || !rooms.has(roomId)) return;
    if (!user.unlockedRooms.has(roomId))
      return socket.emit('room:needs:password', { roomId });
    doSwitchRoom(io, socket, user, roomId);
  });

  // ── message:send (group room) ─────────────────────────────
  socket.on('message:send', ({ text, roomId }) => {
    const user = onlineUsers.get(socket.id);
    if (!user || user.room !== roomId || !rooms.has(roomId)) return;
    if (!user.unlockedRooms.has(roomId)) return;
    const clean = sanitize(text, 2000);
    if (!clean) return;

    const msg = {
      id: uuidv4(), type: 'user', text: clean, roomId,
      author: { id:user.id, username:user.username, displayName:user.displayName, avatar:user.avatar, avatarColor:user.avatarColor },
      timestamp: new Date().toISOString(), reactions: {},
    };
    pushMessage(roomId, msg);
    for (const [sid, recipient] of roomSessions(roomId)) {
      const ra = accounts.get(recipient.username);
      if (ra?.blocked.has(user.username)) continue;
      io.to(sid).emit('message:new', msg);
    }
  });

  // ── dm:open — fetch history for a conversation ────────────
  socket.on('dm:open', ({ withUsername }) => {
    const history = getDmHistory(username, withUsername.toLowerCase());
    socket.emit('dm:history', { withUsername: withUsername.toLowerCase(), messages: history });
  });

  // ── dm:send — 1-to-1 message ──────────────────────────────
  socket.on('dm:send', ({ toUsername, text }) => {
    const user = onlineUsers.get(socket.id);
    if (!user) return;
    const clean = sanitize(text, 2000);
    if (!clean || !toUsername) return;
    const to = toUsername.toLowerCase();

    const recipientAccount = accounts.get(to);
    if (recipientAccount?.blocked.has(user.username))
      return socket.emit('dm:blocked', { toUsername: to });

    const senderAccount = accounts.get(user.username);
    if (senderAccount?.blocked.has(to))
      return socket.emit('dm:blocked', { toUsername: to });

    const dm = {
      id: uuidv4(), type: 'dm',
      from: { id:user.id, username:user.username, displayName:user.displayName, avatar:user.avatar, avatarColor:user.avatarColor },
      toUsername: to,
      text: clean,
      timestamp: new Date().toISOString(),
    };

    pushDm(user.username, to, dm);

    const recipientSession = getSession(to);
    if (recipientSession) {
      io.to(recipientSession.socketId).emit('dm:received', dm);
    }
    socket.emit('dm:sent', dm);
  });

  // ── dm:typing ─────────────────────────────────────────────
  socket.on('dm:typing', ({ toUsername, isTyping }) => {
    const user = onlineUsers.get(socket.id);
    if (!user) return;
    const recipientSession = getSession(toUsername.toLowerCase());
    if (recipientSession) {
      io.to(recipientSession.socketId).emit('dm:typing:update', {
        fromUsername: user.username, displayName: user.displayName, isTyping,
      });
    }
  });

  // ── typing (group) ────────────────────────────────────────
  socket.on('typing:start', ({ roomId }) => {
    const user = onlineUsers.get(socket.id);
    if (!user || user.room !== roomId) return;
    socket.to(roomId).emit('typing:update', { userId:user.id, displayName:user.displayName, isTyping:true });
  });
  socket.on('typing:stop', ({ roomId }) => {
    const user = onlineUsers.get(socket.id);
    if (!user) return;
    socket.to(roomId).emit('typing:update', { userId:user.id, displayName:user.displayName, isTyping:false });
  });

  // ── reactions ─────────────────────────────────────────────
  socket.on('message:react', ({ messageId, roomId, emoji }) => {
    const user = onlineUsers.get(socket.id);
    if (!user || user.room !== roomId || !user.unlockedRooms.has(roomId)) return;
    if (!VALID_EMOJIS.includes(emoji)) return;
    const room = rooms.get(roomId);
    if (!room) return;
    const msg = room.messages.find(m => m.id === messageId);
    if (!msg) return;
    if (!msg.reactions[emoji]) msg.reactions[emoji] = [];
    const i = msg.reactions[emoji].indexOf(user.id);
    if (i===-1) msg.reactions[emoji].push(user.id);
    else        msg.reactions[emoji].splice(i,1);
    if (!msg.reactions[emoji].length) delete msg.reactions[emoji];
    io.to(roomId).emit('message:reaction', { messageId, reactions: msg.reactions });
  });

  // ── disconnect ────────────────────────────────────────────
  socket.on('disconnect', () => {
    const user = onlineUsers.get(socket.id);
    if (!user) return;
    if (user.room) {
      const m = sysMsg(user.room, `${user.displayName} left the chat`);
      pushMessage(user.room, m);
      onlineUsers.delete(socket.id);
      io.to(user.room).emit('message:new', m);
      io.to(user.room).emit('room:users', roomUsers(user.room));
    } else {
      onlineUsers.delete(socket.id);
    }
    io.emit('rooms:update', buildRoomList());
    io.emit('user:offline', { username });
    console.log(`❌ ${displayName} disconnected`);
  });
}

function doSwitchRoom(io, socket, user, roomId) {
  if (user.room === roomId) return;
  const oldRoom = user.room;
  if (oldRoom) {
    socket.leave(oldRoom);
    user.room = roomId;
    const m = sysMsg(oldRoom, `${user.displayName} left the room`);
    pushMessage(oldRoom, m);
    io.to(oldRoom).emit('message:new', m);
    io.to(oldRoom).emit('room:users', roomUsers(oldRoom));
  } else {
    user.room = roomId;
  }
  socket.join(roomId);
  const m = sysMsg(roomId, `${user.displayName} joined the room`);
  pushMessage(roomId, m);
  io.to(roomId).emit('message:new', m);
  io.to(roomId).emit('room:users', roomUsers(roomId));
  socket.emit('room:switched', {
    roomId,
    messages: rooms.get(roomId).messages.slice(-20),
    users:    roomUsers(roomId),
  });
  io.emit('rooms:update', buildRoomList());
}

module.exports = { registerHandlers };