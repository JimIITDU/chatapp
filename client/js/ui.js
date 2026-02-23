/* ui.js — DOM rendering (no direct socket calls) */
'use strict';

// ─── Render sidebar rooms list ────────────────────────────────
// BUG FIX: preserve unread counts across re-renders using state.unread
function renderRooms(filter = '') {
  const filtered = filter
    ? state.rooms.filter(r => r.name.toLowerCase().includes(filter.toLowerCase()))
    : state.rooms;

  document.getElementById('rooms-list').innerHTML = filtered.map(r => {
    const count = state.unread[r.id] || 0;
    return `
      <div class="room-item ${r.id === state.activeRoom ? 'active' : ''}"
           data-room-id="${r.id}"
           onclick="switchRoom('${r.id}')">
        <div class="room-icon">${r.icon}</div>
        <div class="room-details">
          <div class="room-name">${escHtml(r.name)}</div>
          <div class="room-meta">${r.memberCount || 0} online</div>
        </div>
        ${count > 0 ? `<span class="room-badge">${count}</span>` : ''}
      </div>`;
  }).join('');
}

// ─── Render members list ──────────────────────────────────────
function renderMembers() {
  const list = document.getElementById('members-list');
  list.innerHTML = state.roomUsers.map(u => `
    <div class="member-item" data-username="${u.username}">
      <div class="member-avatar" style="background:${u.avatarColor}">${u.avatar}</div>
      <span class="member-name">
        ${escHtml(u.displayName)}${u.id === state.me?.id ? ' <em>(you)</em>' : ''}
      </span>
      ${state.blocked.has(u.username) ? '<span class="member-blocked">blocked</span>' : ''}
    </div>`).join('');

  // Right-click a member to block/unblock
  list.querySelectorAll('.member-item').forEach(el => {
    if (el.dataset.username === state.me?.username) return;
    el.addEventListener('contextmenu', e => {
      e.preventDefault();
      const username = el.dataset.username;
      const isBlocked = state.blocked.has(username);
      state.ctxTarget = { msgId: null, authorUsername: username };
      document.getElementById('ctx-react').style.display = 'none';
      const ctxBlock = document.getElementById('ctx-block');
      ctxBlock.style.display = '';
      ctxBlock.textContent = isBlocked ? `✅ Unblock ${username}` : `🚫 Block ${username}`;
      ctxBlock.onclick = () => {
        closeCtxMenu();
        isBlocked ? unblockUser(username) : openBlockModal(username);
      };
      positionCtxMenu(e.clientX, e.clientY);
    });
  });
}

// ─── Update chat header ───────────────────────────────────────
// BUG FIX: only update elements in the header, not inside messagesArea
// (start-icon / start-room-name are re-created by renderMessages, not here)
function updateHeader() {
  const room = state.rooms.find(r => r.id === state.activeRoom);
  if (!room) return;
  document.getElementById('header-icon').textContent  = room.icon;
  document.getElementById('header-name').textContent  = room.name;
  document.getElementById('header-desc').textContent  = room.description || '';
  document.getElementById('header-count-num').textContent = state.roomUsers.length;
  document.getElementById('message-input').placeholder = `Message #${room.name.toLowerCase()}`;
  document.querySelectorAll('.room-item').forEach(el =>
    el.classList.toggle('active', el.dataset.roomId === state.activeRoom)
  );
}

// ─── Render full message history for a room ───────────────────
function renderMessages(roomId) {
  const room = state.rooms.find(r => r.id === roomId);
  const messagesArea = document.getElementById('messages-area');

  messagesArea.innerHTML = `
    <div class="messages-start">
      <div class="start-icon">${room?.icon || '💬'}</div>
      <p>Welcome to <strong>${escHtml(room?.name || '')}</strong></p>
      <p class="start-sub">This is the beginning of the conversation</p>
    </div>`;

  const msgs = state.messages[roomId] || [];
  // BUG FIX: pass roomId explicitly so isConsecutive checks the right message list
  msgs.forEach((msg, i) => appendMessage(msg, isConsecutive(msg, msgs[i - 1]), roomId));

  updateHeader();
  scrollToBottom(true);
}

// ─── Append one message to the DOM ───────────────────────────
// BUG FIX: roomId param added so consecutive check uses correct list, not activeRoom
function appendMessage(msg, consecutive, roomId) {
  const messagesArea = document.getElementById('messages-area');

  if (msg.type === 'system') {
    const d = document.createElement('div');
    d.className = 'system-msg';
    d.innerHTML = `<span>${escHtml(msg.text)}</span>`;
    messagesArea.appendChild(d);
    return;
  }

  // Hide messages from blocked users
  if (state.blocked.has(msg.author?.username)) return;

  // If consecutive not explicitly passed, compute it
  if (consecutive === undefined) {
    const targetRoom = roomId || state.activeRoom;
    const msgs = state.messages[targetRoom] || [];
    const idx  = msgs.findIndex(m => m.id === msg.id);
    const prev = idx > 0 ? msgs[idx - 1] : null;
    consecutive = isConsecutive(msg, prev);
  }

  const isOwn = msg.author.id === state.me?.id;

  const row = document.createElement('div');
  row.className = `message-row ${isOwn ? 'own' : ''} ${consecutive ? 'consecutive' : ''}`.trim();
  row.dataset.msgId  = msg.id;
  row.dataset.author = msg.author.username;

  row.innerHTML = `
    <div class="msg-avatar" style="background:${msg.author.avatarColor}"
         title="${escHtml(msg.author.displayName)}">${msg.author.avatar}</div>
    <div class="msg-content">
      <div class="msg-header">
        <span class="msg-author">${escHtml(msg.author.displayName)}</span>
        <span class="msg-time">${fmtTime(msg.timestamp)}</span>
      </div>
      <div class="msg-bubble">${escHtml(msg.text)}</div>
      <div class="msg-reactions"></div>
    </div>`;

  // Reactions
  if (msg.reactions && Object.keys(msg.reactions).length > 0) {
    renderReactionChips(row, msg.id, msg.reactions);
  }

  // Right-click bubble → context menu
  row.querySelector('.msg-bubble').addEventListener('contextmenu', e => {
    e.preventDefault();
    state.ctxTarget = { msgId: msg.id, authorUsername: msg.author.username };
    setupMessageCtxMenu(msg.author.username, msg.author.displayName, isOwn);
    positionCtxMenu(e.clientX, e.clientY);
  });

  // Click avatar → block menu
  row.querySelector('.msg-avatar').addEventListener('click', () => {
    if (isOwn) return;
    state.ctxTarget = { msgId: null, authorUsername: msg.author.username };
    setupMessageCtxMenu(msg.author.username, msg.author.displayName, false);
    const rect = row.querySelector('.msg-avatar').getBoundingClientRect();
    positionCtxMenu(rect.right + 4, rect.bottom);
  });

  messagesArea.appendChild(row);
}

function renderReactionChips(row, msgId, reactions) {
  const container = row.querySelector('.msg-reactions');
  container.innerHTML = '';
  Object.entries(reactions).forEach(([emoji, users]) => {
    const chip = document.createElement('span');
    chip.className = `reaction-chip${users.includes(state.me?.id) ? ' mine' : ''}`;
    chip.textContent = `${emoji} ${users.length}`;
    chip.addEventListener('click', () => reactToMessage(msgId, emoji));
    container.appendChild(chip);
  });
}

// ─── Typing bar ───────────────────────────────────────────────
function updateTypingBar() {
  const typingBar  = document.getElementById('typing-bar');
  const typingText = document.getElementById('typing-text');
  const typers     = Object.values(state.typingUsers);

  if (!typers.length) { typingBar.classList.remove('visible'); return; }
  typingBar.classList.add('visible');
  if (typers.length === 1)      typingText.textContent = `${typers[0].displayName} is typing…`;
  else if (typers.length === 2) typingText.textContent = `${typers[0].displayName} and ${typers[1].displayName} are typing…`;
  else                          typingText.textContent = `${typers.length} people are typing…`;
}

// ─── Context menu ─────────────────────────────────────────────
function setupMessageCtxMenu(username, displayName, isOwn) {
  const ctxReact = document.getElementById('ctx-react');
  const ctxBlock = document.getElementById('ctx-block');
  const isBlocked = state.blocked.has(username);

  ctxReact.style.display = state.ctxTarget?.msgId ? '' : 'none';
  ctxReact.onclick = () => { closeCtxMenu(); showReactionStrip(state.ctxTarget.msgId); };

  if (isOwn) {
    ctxBlock.style.display = 'none';
  } else {
    ctxBlock.style.display = '';
    ctxBlock.textContent = isBlocked ? `✅ Unblock ${displayName}` : `🚫 Block ${displayName}`;
    ctxBlock.onclick = () => {
      closeCtxMenu();
      isBlocked ? unblockUser(username) : openBlockModal(username);
    };
  }
}

function positionCtxMenu(x, y) {
  const menu = document.getElementById('ctx-menu');
  menu.style.left = `${Math.min(x, window.innerWidth  - 190)}px`;
  menu.style.top  = `${Math.min(y, window.innerHeight - 130)}px`;
  menu.classList.remove('hidden');
}

function closeCtxMenu() {
  document.getElementById('ctx-menu').classList.add('hidden');
}

// ─── Reaction strip ───────────────────────────────────────────
function showReactionStrip(msgId) {
  const popup = document.getElementById('reaction-popup');
  const opts  = document.getElementById('reaction-options');
  opts.innerHTML = '';

  QUICK_REACTIONS.forEach(emoji => {
    const btn = document.createElement('div');
    btn.className   = 'reaction-option';
    btn.textContent = emoji;
    btn.addEventListener('click', () => {
      reactToMessage(msgId, emoji);
      closeReactionStrip();
    });
    opts.appendChild(btn);
  });

  popup.style.left      = '50%';
  popup.style.top       = '50%';
  popup.style.transform = 'translate(-50%,-50%)';
  popup.classList.remove('hidden');
}

function closeReactionStrip() {
  document.getElementById('reaction-popup').classList.add('hidden');
}

// ─── Block modal ──────────────────────────────────────────────
function openBlockModal(username) {
  document.getElementById('block-target-name').textContent = username;
  state.ctxTarget = { ...state.ctxTarget, authorUsername: username };
  document.getElementById('block-modal').classList.remove('hidden');
}

function closeBlockModal() {
  document.getElementById('block-modal').classList.add('hidden');
}

// ─── Emoji picker ─────────────────────────────────────────────
function buildEmojiPicker() {
  const grid = document.getElementById('emoji-grid');
  grid.innerHTML = '';
  EMOJIS.forEach(emoji => {
    const item = document.createElement('div');
    item.className   = 'emoji-item';
    item.textContent = emoji;
    item.addEventListener('click', () => {
      const input = document.getElementById('message-input');
      input.value += emoji;
      input.focus();
      document.getElementById('char-count').textContent = `${input.value.length} / 2000`;
    });
    grid.appendChild(item);
  });
}

// ─── DOM helpers ─────────────────────────────────────────────
function scrollToBottom(instant = false) {
  const area = document.getElementById('messages-area');
  area.scrollTo({ top: area.scrollHeight, behavior: instant ? 'instant' : 'smooth' });
}