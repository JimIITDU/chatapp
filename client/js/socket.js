/* socket.js */
'use strict';

let socket = null;
let _connecting = false;

function connectSocket() {
  if (socket?.connected || _connecting) return;
  _connecting = true;
  socket = io({ auth: { token }, reconnectionAttempts: 5 });

  socket.on('connect', () => { _connecting = false; });

  socket.on('connect_error', err => {
    _connecting = false;
    if (err.message === 'AUTH_REQUIRED' || err.message === 'AUTH_INVALID') {
      clearToken();
      document.getElementById('app').classList.add('hidden');
      document.getElementById('auth-screen').classList.remove('hidden');
      showToast('Session expired. Please sign in again.', 'warning');
    }
  });

  // ── init ─────────────────────────────────────────────────
  socket.on('init', data => {
    state.me      = data.user;
    state.rooms   = data.rooms;
    state.blocked = new Set(data.blocked || []);

    const av = document.getElementById('my-avatar');
    av.style.background = state.me.avatarColor;
    av.textContent = state.me.avatar;

    renderConvoList();
    showLobby();
  });

  // ── rooms:update ─────────────────────────────────────────
  socket.on('rooms:update', updates => {
    state.rooms = state.rooms.map(r => { const u = updates.find(x=>x.id===r.id); return u?{...r,...u}:r; });
    renderConvoList();
  });

  // ── room:needs:password ──────────────────────────────────
  socket.on('room:needs:password', ({ roomId }) => showPasswordPrompt(roomId));

  // ── room:unlock:result ────────────────────────────────────
  socket.on('room:unlock:result', ({ roomId, success, error }) => {
    if (success) {
      state.unlockedRooms.add(roomId);
      closePasswordPrompt();
      renderConvoList();
    } else {
      showPasswordError(error || 'Wrong password.');
    }
  });

  // ── room:switched ─────────────────────────────────────────
  socket.on('room:switched', ({ roomId, messages, users }) => {
    state.activeView = { type:'room', id:roomId };
    state.roomMessages[roomId] = messages;
    state.roomUsers[roomId]    = users;
    delete state.unread[roomId];
    renderMessages();
    renderMembers();
    renderConvoList();
    setNavActive('chats');
  });

  // ── room:users ───────────────────────────────────────────
  socket.on('room:users', users => {
    const v = state.activeView;
    if (v?.type === 'room') {
      state.roomUsers[v.id] = users;
      renderMembers();
      updateChatHeader();
    }
  });

  // ── message:new (group) ───────────────────────────────────
  socket.on('message:new', msg => {
    if (!state.roomMessages[msg.roomId]) state.roomMessages[msg.roomId] = [];
    if (msg.type === 'user' && state.blocked.has(msg.author?.username)) return;
    state.roomMessages[msg.roomId].push(msg);

    const isActive = state.activeView?.type === 'room' && state.activeView.id === msg.roomId;
    if (isActive) {
      const msgs = state.roomMessages[msg.roomId];
      appendMessage(msg, isConsecutive(msg, msgs[msgs.length-2]));
      scrollToBottom();
    } else if (msg.type === 'user') {
      state.unread[msg.roomId] = (state.unread[msg.roomId]||0)+1;
    }
    renderConvoList();
  });

  // ── typing (group) ────────────────────────────────────────
  socket.on('typing:update', ({ userId, displayName, isTyping }) => {
    const v = state.activeView;
    if (v?.type === 'room') setTyping(v.id, userId, displayName, isTyping);
  });

  // ── reactions ─────────────────────────────────────────────
  socket.on('message:reaction', ({ messageId, reactions }) => {
    const v = state.activeView;
    if (!v) return;
    const msgs = v.type==='room' ? (state.roomMessages[v.id]||[]) : (state.dmMessages[v.id]||[]);
    const msg  = msgs.find(m => m.id === messageId);
    if (msg) msg.reactions = reactions;
    const row = document.querySelector(`[data-msg-id="${messageId}"]`);
    if (row) renderReactionChips(row, messageId, reactions);
  });

  // ── DM history (response to dm:open) ─────────────────────
  socket.on('dm:history', ({ withUsername, messages }) => {
    state.dmMessages[withUsername] = messages;
    if (state.activeView?.type === 'dm' && state.activeView.id === withUsername) {
      renderMessages();
    }
  });

  // ── dm:received ──────────────────────────────────────────
  socket.on('dm:received', dm => {
    const from = dm.from.username;
    if (state.blocked.has(from)) return;

    if (!state.dmMessages[from]) state.dmMessages[from] = [];
    state.dmMessages[from].push(dm);

    // Update preview
    ensureDmPreview(from, dm.from);
    state.dmPreviews[from].lastMsg  = dm.text;
    state.dmPreviews[from].lastTime = dm.timestamp;

    const isActive = state.activeView?.type === 'dm' && state.activeView.id === from;
    if (isActive) {
      const msgs = state.dmMessages[from];
      appendMessage(dm, isConsecutive(dm, msgs[msgs.length-2]));
      scrollToBottom();
    } else {
      state.dmPreviews[from].unread = (state.dmPreviews[from].unread||0)+1;
      showToast(`💬 ${dm.from.displayName}: ${dm.text.slice(0,40)}`, 'info');
    }
    renderConvoList();
    updateDmBadge();
  });

  // ── dm:sent ───────────────────────────────────────────────
  socket.on('dm:sent', dm => {
    const to = dm.toUsername;
    if (!state.dmMessages[to]) state.dmMessages[to] = [];
    state.dmMessages[to].push(dm);

    if (state.dmPreviews[to]) {
      state.dmPreviews[to].lastMsg  = dm.text;
      state.dmPreviews[to].lastTime = dm.timestamp;
    }

    const isActive = state.activeView?.type === 'dm' && state.activeView.id === to;
    if (isActive) {
      const msgs = state.dmMessages[to];
      appendMessage(dm, isConsecutive(dm, msgs[msgs.length-2]));
      scrollToBottom();
    }
    renderConvoList();
  });

  // ── dm:typing ─────────────────────────────────────────────
  socket.on('dm:typing:update', ({ fromUsername, displayName, isTyping }) => {
    if (state.activeView?.type === 'dm' && state.activeView.id === fromUsername) {
      setTyping(`dm:${fromUsername}`, fromUsername, displayName, isTyping);
    }
  });

  socket.on('dm:blocked', ({ toUsername }) => showToast(`Cannot send message to ${toUsername}.`, 'error'));
  socket.on('dm:error',   ({ error })      => showToast(error, 'error'));

  // ── online/offline ────────────────────────────────────────
  socket.on('user:online', ({ username, displayName, avatarColor, avatar }) => {
    state.onlineUsers.add(username);
    if (state.dmPreviews[username]) {
      state.dmPreviews[username].displayName = displayName;
      state.dmPreviews[username].avatarColor = avatarColor;
      state.dmPreviews[username].avatar      = avatar;
    }
    renderConvoList();
    if (state.activeView?.type === 'dm' && state.activeView.id === username) updateChatHeader();
  });
  socket.on('user:offline', ({ username }) => {
    state.onlineUsers.delete(username);
    renderConvoList();
    if (state.activeView?.type === 'dm' && state.activeView.id === username) updateChatHeader();
  });

  // ── block events ──────────────────────────────────────────
  socket.on('user:blocked', ({ username }) => {
    state.blocked.add(username);
    document.querySelectorAll(`[data-author="${username}"]`).forEach(el => el.style.display='none');
    renderMembers();
    showToast(`Blocked ${username}.`, 'warning');
  });
  socket.on('user:unblocked', ({ username }) => {
    state.blocked.delete(username);
    document.querySelectorAll(`[data-author="${username}"]`).forEach(el => el.style.display='');
    renderMembers();
    showToast(`Unblocked ${username}.`, 'success');
  });
}

function disconnectSocket() {
  if (socket) { socket.disconnect(); socket=null; _connecting=false; }
}

// ── Helpers ───────────────────────────────────────────────────
function ensureDmPreview(username, authorInfo) {
  if (!state.dmPreviews[username]) {
    state.dmPreviews[username] = {
      displayName: authorInfo?.displayName || username,
      avatar:      authorInfo?.avatar      || username[0].toUpperCase(),
      avatarColor: authorInfo?.avatarColor || '#6366F1',
      lastMsg: null, lastTime: null, unread: 0,
    };
  }
}

function updateDmBadge() {
  const totalUnread = Object.values(state.dmPreviews).reduce((s,p) => s+(p.unread||0), 0);
  const badge = document.getElementById('dm-nav-badge');
  if (badge) { badge.textContent = totalUnread||''; badge.style.display = totalUnread?'':'none'; }
}

// ── Outgoing ─────────────────────────────────────────────────
function openRoom(roomId) {
  if (state.activeView?.type === 'room' && state.activeView.id === roomId) return;
  if (state.unlockedRooms.has(roomId)) {
    socket?.emit('room:switch', roomId);
  } else {
    showPasswordPrompt(roomId);
  }
}

function openDm(username) {
  if (username === state.me?.username) return;
  state.activeView = { type:'dm', id: username };

  // Ensure preview entry exists
  const session = { username, displayName: username, avatar: username[0].toUpperCase(), avatarColor:'#6366F1' };
  ensureDmPreview(username, session);

  // Clear unread
  if (state.dmPreviews[username]) state.dmPreviews[username].unread = 0;
  updateDmBadge();

  // Members panel hidden for DMs
  const mp = document.getElementById('members-panel');
  if (mp) mp.classList.add('hidden');

  renderConvoList();
  renderMessages();
  setNavActive('chats');

  // Fetch history from server
  socket?.emit('dm:open', { withUsername: username });
}

function switchRoom(roomId) { openRoom(roomId); }

// _typingTimer declared in app.js
function sendTypingStart() {
  const v = state.activeView;
  if (!v) return;
  if (v.type === 'room') socket?.emit('typing:start', { roomId: v.id });
  else socket?.emit('dm:typing', { toUsername: v.id, isTyping: true });
}
function sendTypingStop() {
  const v = state.activeView;
  if (!v) return;
  if (v.type === 'room') socket?.emit('typing:stop', { roomId: v.id });
  else socket?.emit('dm:typing', { toUsername: v.id, isTyping: false });
}

function sendMessage(text) {
  const v = state.activeView;
  if (!socket || !text.trim() || !v) return;
  if (v.type === 'room') socket.emit('message:send', { text: text.trim(), roomId: v.id });
  else                   socket.emit('dm:send',       { toUsername: v.id, text: text.trim() });
  sendTypingStop();
}

function reactToMessage(msgId, emoji) {
  if (state.activeView?.type === 'room')
    socket?.emit('message:react', { messageId: msgId, roomId: state.activeView.id, emoji });
}

function submitRoomPassword(roomId, password) {
  socket?.emit('room:unlock', { roomId, password });
}