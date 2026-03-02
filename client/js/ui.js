/* ui.js — All DOM rendering */
'use strict';

// ── Render left conversation list ─────────────────────────────
function renderConvoList(filter = '') {
  const list = document.getElementById('convo-list');
  const f = filter.toLowerCase();

  let html = '';

  // ── Group rooms section ──────────────────────────────────
  const filteredRooms = state.rooms.filter(r => !f || r.name.toLowerCase().includes(f));
  if (filteredRooms.length) {
    html += `<div class="convo-section-label">Rooms</div>`;
    html += filteredRooms.map(r => {
      const isActive  = state.activeView?.type === 'room' && state.activeView.id === r.id;
      const unlocked  = state.unlockedRooms.has(r.id);
      const unread    = state.unread[r.id] || 0;
      const lastMsg   = (state.roomMessages[r.id] || []).filter(m => m.type==='user').slice(-1)[0];
      const preview   = lastMsg ? escHtml(lastMsg.text.slice(0,40)) : (r.hasPassword && !unlocked ? '🔒 Password required' : 'No messages yet');
      const time      = lastMsg ? fmtDate(lastMsg.timestamp) : '';
      return `<div class="convo-item ${isActive?'active':''}" onclick="openRoom('${r.id}')">
        <div class="convo-avatar group" style="background:${roomColor(r.id)}">${r.icon}</div>
        <div class="convo-body">
          <div class="convo-row1">
            <span class="convo-name">${escHtml(r.name)} ${r.hasPassword?(unlocked?'🔓':'🔒'):''}</span>
            <span class="convo-time">${time}</span>
          </div>
          <div class="convo-row2">
            <span class="convo-preview">${preview}</span>
            ${unread ? `<span class="convo-unread">${unread}</span>` : ''}
          </div>
        </div>
      </div>`;
    }).join('');
  }

  // ── DM section ────────────────────────────────────────────
  const dmEntries = Object.entries(state.dmPreviews)
    .filter(([u]) => !f || u.includes(f) || state.dmPreviews[u].displayName.toLowerCase().includes(f))
    .sort(([,a],[,b]) => (b.lastTime||'') > (a.lastTime||'') ? 1 : -1);

  if (dmEntries.length) {
    html += `<div class="convo-section-label">Direct Messages</div>`;
    html += dmEntries.map(([username, p]) => {
      const isActive = state.activeView?.type === 'dm' && state.activeView.id === username;
      const isOnline = state.onlineUsers.has(username);
      return `<div class="convo-item ${isActive?'active':''}" onclick="openDm('${username}')">
        <div class="convo-avatar" style="background:${p.avatarColor}">
          ${p.avatar}
          ${isOnline ? '<div class="online-dot"></div>' : ''}
        </div>
        <div class="convo-body">
          <div class="convo-row1">
            <span class="convo-name">${escHtml(p.displayName)}</span>
            <span class="convo-time">${p.lastTime ? fmtDate(p.lastTime) : ''}</span>
          </div>
          <div class="convo-row2">
            <span class="convo-preview">${p.lastMsg ? escHtml(p.lastMsg.slice(0,40)) : 'Say hi!'}</span>
            ${p.unread ? `<span class="convo-unread">${p.unread}</span>` : ''}
          </div>
        </div>
      </div>`;
    }).join('');
  }

  if (!html) {
    html = `<div style="padding:24px;text-align:center;color:var(--text-muted);font-size:13px;">No conversations yet</div>`;
  }

  list.innerHTML = html;
}

function roomColor(id) {
  const colors = { general:'#3B82F6', tech:'#8B5CF6', random:'#10B981', gaming:'#F97316' };
  return colors[id] || '#6366F1';
}

// ── Chat header ───────────────────────────────────────────────
function updateChatHeader() {
  const v = state.activeView;
  if (!v) return;
  const avatarEl = document.getElementById('chat-header-avatar');
  const nameEl   = document.getElementById('chat-header-name');
  const subEl    = document.getElementById('chat-header-sub');

  if (v.type === 'room') {
    const room = state.rooms.find(r => r.id === v.id);
    if (!room) return;
    avatarEl.className = 'chat-header-avatar group';
    avatarEl.style.background = roomColor(v.id);
    avatarEl.textContent = room.icon;
    nameEl.textContent = room.name;
    const users = state.roomUsers[v.id] || [];
    subEl.textContent = `${users.length} member${users.length !== 1 ? 's' : ''}`;
    document.getElementById('message-input').placeholder = `Message #${room.name.toLowerCase()}`;
    document.getElementById('message-input').disabled = false;
    document.getElementById('send-btn').disabled = false;
  } else {
    // DM
    const p = state.dmPreviews[v.id];
    avatarEl.className = 'chat-header-avatar';
    avatarEl.style.background = p?.avatarColor || '#6366F1';
    avatarEl.textContent = p?.avatar || v.id[0].toUpperCase();
    nameEl.textContent = p?.displayName || v.id;
    subEl.textContent  = state.onlineUsers.has(v.id) ? '🟢 Online' : 'Offline';
    document.getElementById('message-input').placeholder = `Message ${p?.displayName || v.id}`;
    document.getElementById('message-input').disabled = false;
    document.getElementById('send-btn').disabled = false;
  }
}

// ── Messages ──────────────────────────────────────────────────
function renderMessages() {
  const v = state.activeView;
  if (!v) return;
  const area = document.getElementById('messages-area');
  const msgs = v.type === 'room'
    ? (state.roomMessages[v.id] || [])
    : (state.dmMessages[v.id]  || []);

  area.innerHTML = '';
  msgs.forEach((msg, i) => appendMessage(msg, isConsecutive(msg, msgs[i-1])));
  updateChatHeader();
  scrollToBottom(true);
}

function appendMessage(msg, consecutive = false) {
  const area = document.getElementById('messages-area');
  const v    = state.activeView;

  if (msg.type === 'system') {
    const d = document.createElement('div');
    d.className = 'system-msg';
    d.innerHTML = `<span>${escHtml(msg.text)}</span>`;
    area.appendChild(d);
    return;
  }

  // Determine author
  const author   = msg.author || msg.from;
  const isOwn    = author?.id === state.me?.id || author?.username === state.me?.username;
  const isDm     = v?.type === 'dm';
  const isGroup  = v?.type === 'room';

  if (state.blocked.has(author?.username)) return;

  const row = document.createElement('div');
  row.className = `message-row ${isOwn?'own':''} ${consecutive?'consecutive':''}`.trim();
  row.dataset.msgId  = msg.id;
  row.dataset.author = author?.username || '';

  // Avatar (only shown in group chats for others)
  const showAvatar = isGroup && !isOwn;

  row.innerHTML = `
    ${showAvatar ? `<div class="msg-avatar" style="background:${author.avatarColor}" title="${escHtml(author.displayName)}">${author.avatar}</div>` : (isGroup ? '<div style="width:28px;flex-shrink:0"></div>' : '')}
    <div class="msg-content">
      ${showAvatar && !consecutive ? `<div class="msg-sender-name" style="color:${author.avatarColor}">${escHtml(author.displayName)}</div>` : ''}
      <div class="msg-bubble">${escHtml(msg.text)}</div>
      <div class="msg-meta">
        <span class="msg-time">${fmtTime(msg.timestamp)}</span>
        ${isOwn ? '<span class="msg-tick">✓✓</span>' : ''}
      </div>
      <div class="msg-reactions"></div>
    </div>`;

  if (msg.reactions && Object.keys(msg.reactions).length > 0) {
    renderReactionChips(row, msg.id, msg.reactions);
  }

  // Right-click bubble
  row.querySelector('.msg-bubble').addEventListener('contextmenu', e => {
    e.preventDefault();
    state.ctxTarget = { msgId: msg.id, authorUsername: author?.username };
    setupCtxMenu(author?.username, author?.displayName, isOwn);
    positionCtxMenu(e.clientX, e.clientY);
  });

  // Click avatar → open DM
  const avatarEl = row.querySelector('.msg-avatar');
  if (avatarEl) {
    avatarEl.addEventListener('click', () => {
      if (!isOwn && author?.username) openDm(author.username);
    });
  }

  area.appendChild(row);
}

function renderReactionChips(row, msgId, reactions) {
  const c = row.querySelector('.msg-reactions');
  c.innerHTML = '';
  Object.entries(reactions).forEach(([emoji, users]) => {
    const chip = document.createElement('span');
    chip.className = `reaction-chip${users.includes(state.me?.id)?' mine':''}`;
    chip.textContent = `${emoji} ${users.length}`;
    chip.addEventListener('click', () => reactToMessage(msgId, emoji));
    c.appendChild(chip);
  });
}

// ── Members panel ─────────────────────────────────────────────
function renderMembers() {
  const panel = document.getElementById('members-panel');
  if (!panel) return;
  const v = state.activeView;
  if (!v || v.type !== 'room') { panel.classList.add('hidden'); return; }

  const users = state.roomUsers[v.id] || [];
  document.getElementById('members-panel-list').innerHTML = users.map(u => {
    const isMe      = u.id === state.me?.id;
    const isBlocked = state.blocked.has(u.username);
    return `<div class="member-item" data-username="${u.username}">
      <div class="member-avatar" style="background:${u.avatarColor}">${u.avatar}</div>
      <span class="member-name">${escHtml(u.displayName)}${isMe?' <em>(you)</em>':''}</span>
      ${isBlocked ? '<span class="member-blocked">blocked</span>' : ''}
    </div>`;
  }).join('');

  // Right-click member → block/unblock
  panel.querySelectorAll('.member-item').forEach(el => {
    if (el.dataset.username === state.me?.username) return;
    el.addEventListener('contextmenu', e => {
      e.preventDefault();
      const un = el.dataset.username;
      const isBlocked = state.blocked.has(un);
      state.ctxTarget = { msgId: null, authorUsername: un };
      const ctxBlock = document.getElementById('ctx-block');
      document.getElementById('ctx-react').style.display = 'none';
      ctxBlock.style.display = '';
      ctxBlock.textContent = isBlocked ? `✅ Unblock ${un}` : `🚫 Block ${un}`;
      ctxBlock.onclick = () => { closeCtxMenu(); isBlocked ? unblockUser(un) : openBlockModal(un); };
      positionCtxMenu(e.clientX, e.clientY);
    });
    // Click → open DM
    el.addEventListener('click', () => openDm(el.dataset.username));
  });
}

// ── Typing bar ────────────────────────────────────────────────
function updateTypingBar() {
  const bar  = document.getElementById('typing-bar');
  const text = document.getElementById('typing-text');
  const key  = state.activeView?.type === 'room' ? state.activeView.id : `dm:${state.activeView?.id}`;
  const typers = Object.values(state.typingUsers[key] || {});
  if (!typers.length) { bar.classList.remove('visible'); return; }
  bar.classList.add('visible');
  if (typers.length === 1) text.textContent = `${typers[0]} is typing…`;
  else                     text.textContent = `${typers.length} people are typing…`;
}

function setTyping(key, userId, displayName, isTyping) {
  if (!state.typingUsers[key]) state.typingUsers[key] = {};
  if (isTyping) {
    if (state.typingUsers[key][userId]) clearTimeout(state.typingUsers[key][userId].timer);
    const timer = setTimeout(() => { delete state.typingUsers[key][userId]; updateTypingBar(); }, 3000);
    state.typingUsers[key][userId] = { displayName: displayName || userId, timer };
  } else {
    if (state.typingUsers[key][userId]) { clearTimeout(state.typingUsers[key][userId].timer); delete state.typingUsers[key][userId]; }
  }
  updateTypingBar();
}

// ── Context menu ──────────────────────────────────────────────
function setupCtxMenu(username, displayName, isOwn) {
  const ctxReact = document.getElementById('ctx-react');
  const ctxBlock = document.getElementById('ctx-block');
  const isBlocked = state.blocked.has(username);

  ctxReact.style.display = state.ctxTarget?.msgId ? '' : 'none';
  ctxReact.onclick = () => { closeCtxMenu(); showReactionStrip(state.ctxTarget.msgId); };

  if (isOwn) { ctxBlock.style.display = 'none'; }
  else {
    ctxBlock.style.display = '';
    ctxBlock.textContent = isBlocked ? `✅ Unblock ${displayName}` : `🚫 Block ${displayName}`;
    ctxBlock.onclick = () => { closeCtxMenu(); isBlocked ? unblockUser(username) : openBlockModal(username); };
  }
}
function positionCtxMenu(x, y) {
  const m = document.getElementById('ctx-menu');
  m.style.left = `${Math.min(x, window.innerWidth-190)}px`;
  m.style.top  = `${Math.min(y, window.innerHeight-130)}px`;
  m.classList.remove('hidden');
}
function closeCtxMenu() { document.getElementById('ctx-menu').classList.add('hidden'); }

function showReactionStrip(msgId) {
  const popup = document.getElementById('reaction-popup');
  const opts  = document.getElementById('reaction-options');
  opts.innerHTML = '';
  QUICK_REACTIONS.forEach(emoji => {
    const b = document.createElement('div');
    b.className = 'reaction-option'; b.textContent = emoji;
    b.addEventListener('click', () => { reactToMessage(msgId, emoji); closeReactionStrip(); });
    opts.appendChild(b);
  });
  popup.style.cssText = 'left:50%;top:50%;transform:translate(-50%,-50%)';
  popup.classList.remove('hidden');
}
function closeReactionStrip() { document.getElementById('reaction-popup').classList.add('hidden'); }

function openBlockModal(username) {
  document.getElementById('block-target-name').textContent = username;
  state.ctxTarget = { ...state.ctxTarget, authorUsername: username };
  document.getElementById('block-modal').classList.remove('hidden');
}
function closeBlockModal() { document.getElementById('block-modal').classList.add('hidden'); }

// ── Password prompt ───────────────────────────────────────────
function showPasswordPrompt(roomId) {
  const room = state.rooms.find(r => r.id === roomId);
  document.getElementById('pw-prompt-room-name').textContent = room?.name || roomId;
  document.getElementById('pw-prompt-icon').textContent      = room?.icon || '🔒';
  document.getElementById('room-password-input').value       = '';
  document.getElementById('pw-prompt-error').classList.add('hidden');
  const modal = document.getElementById('pw-prompt-modal');
  modal._roomId = roomId;
  modal.classList.remove('hidden');
  setTimeout(() => document.getElementById('room-password-input').focus(), 50);
}
function closePasswordPrompt() { document.getElementById('pw-prompt-modal').classList.add('hidden'); }
function showPasswordError(msg) {
  const el = document.getElementById('pw-prompt-error');
  el.textContent = msg; el.classList.remove('hidden');
  document.getElementById('room-password-input').value = '';
  document.getElementById('room-password-input').focus();
}

// ── Lobby ─────────────────────────────────────────────────────
function showLobby() {
  const area = document.getElementById('messages-area');
  area.innerHTML = `
    <div class="lobby">
      <div class="lobby-icon">💬</div>
      <h2>Welcome, ${escHtml(state.me?.displayName || '')}!</h2>
      <p>Select a room or direct message from the sidebar to start chatting.</p>
    </div>`;
  document.getElementById('chat-header-avatar').textContent = '💬';
  document.getElementById('chat-header-avatar').style.background = 'var(--accent)';
  document.getElementById('chat-header-name').textContent = 'ChatApp';
  document.getElementById('chat-header-sub').textContent  = 'Choose a conversation';
  document.getElementById('message-input').disabled = true;
  document.getElementById('send-btn').disabled = true;
  document.getElementById('message-input').placeholder = 'Select a conversation…';
}

// ── Emoji picker ──────────────────────────────────────────────
function buildEmojiPicker() {
  const grid = document.getElementById('emoji-grid');
  grid.innerHTML = '';
  EMOJIS.forEach(emoji => {
    const item = document.createElement('div');
    item.className = 'emoji-item'; item.textContent = emoji;
    item.addEventListener('click', () => {
      const input = document.getElementById('message-input');
      input.value += emoji; input.focus();
      document.getElementById('char-count').textContent = `${input.value.length}/2000`;
    });
    grid.appendChild(item);
  });
}

function scrollToBottom(instant = false) {
  const a = document.getElementById('messages-area');
  a.scrollTo({ top: a.scrollHeight, behavior: instant ? 'instant' : 'smooth' });
}

// ── Nav buttons ───────────────────────────────────────────────
function setNavActive(tab) {
  document.querySelectorAll('.nav-btn[data-tab]').forEach(b => b.classList.toggle('active', b.dataset.tab === tab));
}

// ── Theme toggle ──────────────────────────────────────────────
function initTheme() {
  const saved = localStorage.getItem('theme') || 'dark';
  document.documentElement.setAttribute('data-theme', saved === 'light' ? 'light' : '');
  updateThemeIcon(saved);
}
function toggleTheme() {
  const isLight = document.documentElement.getAttribute('data-theme') === 'light';
  const next = isLight ? 'dark' : 'light';
  document.documentElement.setAttribute('data-theme', next === 'light' ? 'light' : '');
  localStorage.setItem('theme', next);
  updateThemeIcon(next);
}
function updateThemeIcon(theme) {
  const btn = document.getElementById('theme-toggle');
  if (btn) btn.title = theme === 'light' ? 'Switch to Dark' : 'Switch to Light';
  const icon = document.getElementById('theme-icon');
  if (icon) icon.textContent = theme === 'light' ? '🌙' : '☀️';
}