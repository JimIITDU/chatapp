/* socket.js — Socket.IO connection + event handlers */
'use strict';

let socket = null;

// BUG FIX: guard against multiple connectSocket() calls (auto-login + manual login)
let _socketConnecting = false;

function connectSocket() {
  if (socket?.connected || _socketConnecting) return;
  _socketConnecting = true;

  socket = io({ auth: { token }, reconnectionAttempts: 5 });

  socket.on('connect', () => { _socketConnecting = false; });

  socket.on('connect_error', (err) => {
    _socketConnecting = false;
    if (err.message === 'AUTH_REQUIRED' || err.message === 'AUTH_INVALID') {
      clearToken();
      document.getElementById('app').classList.add('hidden');
      document.getElementById('auth-screen').classList.remove('hidden');
      showToast('Session expired. Please sign in again.', 'warning');
    }
  });

  // ── init ─────────────────────────────────────────────────
  socket.on('init', (data) => {
    state.me         = data.user;
    state.rooms      = data.rooms;
    state.activeRoom = data.activeRoom;
    state.blocked    = new Set(data.blocked || []);
    state.unread     = {};

    // Cache messages for all rooms
    data.rooms.forEach(r => { state.messages[r.id] = r.messages || []; });

    // Init sidebar profile
    const av = document.getElementById('my-avatar');
    av.style.background = state.me.avatarColor;
    av.textContent      = state.me.avatar;
    document.getElementById('my-username').textContent = state.me.displayName;

    renderRooms();
    renderMessages(state.activeRoom);
  });

  // ── message:new ──────────────────────────────────────────
  socket.on('message:new', (msg) => {
    if (!state.messages[msg.roomId]) state.messages[msg.roomId] = [];

    // Client-side block filter (server also blocks, this is just defence-in-depth)
    if (msg.type === 'user' && state.blocked.has(msg.author?.username)) return;

    state.messages[msg.roomId].push(msg);

    if (msg.roomId === state.activeRoom) {
      // BUG FIX: pass activeRoom explicitly so appendMessage uses right message list
      appendMessage(msg, undefined, state.activeRoom);
      scrollToBottom();
    } else if (msg.type === 'user') {
      // Increment unread count in state (renderRooms will display it)
      state.unread[msg.roomId] = (state.unread[msg.roomId] || 0) + 1;
      renderRooms(); // re-render to show badge — unread state is preserved in state.unread
    }
  });

  // ── room:users ───────────────────────────────────────────
  socket.on('room:users', (users) => {
    state.roomUsers = users;
    renderMembers();
    document.getElementById('header-count-num').textContent = users.length;
  });

  // ── rooms:update (member counts changed) ─────────────────
  // BUG FIX: merge updates into state.rooms instead of replacing,
  // and renderRooms preserves state.unread
  socket.on('rooms:update', (updates) => {
    state.rooms = state.rooms.map(r => {
      const u = updates.find(x => x.id === r.id);
      return u ? { ...r, ...u } : r;
    });
    renderRooms();
  });

  // ── room:switched (confirmed switch from server) ──────────
  socket.on('room:switched', (data) => {
    state.activeRoom            = data.roomId;
    state.messages[data.roomId] = data.messages;
    state.roomUsers             = data.users;
    // Clear unread for this room
    delete state.unread[data.roomId];
    renderMessages(data.roomId);
    renderMembers();
    // renderMessages calls updateHeader internally
  });

  // ── typing:update ─────────────────────────────────────────
  socket.on('typing:update', ({ userId, displayName, isTyping }) => {
    if (isTyping) {
      if (state.typingUsers[userId]) clearTimeout(state.typingUsers[userId].timer);
      const timer = setTimeout(() => {
        delete state.typingUsers[userId];
        updateTypingBar();
      }, 3000);
      state.typingUsers[userId] = { displayName, timer };
    } else {
      if (state.typingUsers[userId]) {
        clearTimeout(state.typingUsers[userId].timer);
        delete state.typingUsers[userId];
      }
    }
    updateTypingBar();
  });

  // ── message:reaction ──────────────────────────────────────
  socket.on('message:reaction', ({ messageId, reactions }) => {
    const msgs = state.messages[state.activeRoom] || [];
    const msg  = msgs.find(m => m.id === messageId);
    if (msg) msg.reactions = reactions;
    const row = document.querySelector(`[data-msg-id="${messageId}"]`);
    if (row) renderReactionChips(row, messageId, reactions);
  });

  // ── user:blocked / user:unblocked ─────────────────────────
  socket.on('user:blocked', ({ username }) => {
    state.blocked.add(username);
    document.querySelectorAll(`[data-author="${username}"]`).forEach(el => el.style.display = 'none');
    renderMembers();
    showToast(`Blocked ${username}. Their messages are hidden.`, 'warning');
  });

  socket.on('user:unblocked', ({ username }) => {
    state.blocked.delete(username);
    document.querySelectorAll(`[data-author="${username}"]`).forEach(el => el.style.display = '');
    renderMembers();
    showToast(`Unblocked ${username}.`, 'success');
  });
}

function disconnectSocket() {
  if (socket) {
    socket.disconnect();
    socket = null;
    _socketConnecting = false;
  }
}

// ─── Outgoing actions ─────────────────────────────────────────
function switchRoom(roomId) {
  if (!socket || roomId === state.activeRoom) return;
  socket.emit('room:switch', roomId);
}

let _typingTimer;
function sendTypingStart() {
  socket?.emit('typing:start', { roomId: state.activeRoom });
}
function sendTypingStop() {
  socket?.emit('typing:stop', { roomId: state.activeRoom });
}

function sendMessage(text) {
  if (!socket || !text.trim()) return;
  socket.emit('message:send', { text: text.trim(), roomId: state.activeRoom });
  sendTypingStop();
}

function reactToMessage(msgId, emoji) {
  socket?.emit('message:react', { messageId: msgId, roomId: state.activeRoom, emoji });
}