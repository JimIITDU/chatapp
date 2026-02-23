/* app.js — Entry point, wires up UI interactions */
'use strict';

// ─── Launch ───────────────────────────────────────────────────
function launchApp() {
  document.getElementById('auth-screen').classList.add('hidden');
  document.getElementById('app').classList.remove('hidden');
  buildEmojiPicker();
  connectSocket();
}

// ─── Search rooms ─────────────────────────────────────────────
document.getElementById('search-input').addEventListener('input', e => {
  renderRooms(e.target.value);
});

// ─── Message input ────────────────────────────────────────────
const messageInput = document.getElementById('message-input');
const charCount    = document.getElementById('char-count');

messageInput.addEventListener('input', () => {
  // Auto-resize
  messageInput.style.height = 'auto';
  messageInput.style.height = Math.min(messageInput.scrollHeight, 120) + 'px';
  charCount.textContent = `${messageInput.value.length} / 2000`;

  // Typing indicator
  clearTimeout(_typingTimer);
  sendTypingStart();
  _typingTimer = setTimeout(sendTypingStop, 1500);
});

messageInput.addEventListener('keydown', e => {
  if (e.key === 'Enter' && !e.shiftKey) {
    e.preventDefault();
    doSendMessage();
  }
});

document.getElementById('send-btn').addEventListener('click', doSendMessage);

function doSendMessage() {
  const text = messageInput.value.trim();
  if (!text) return;
  sendMessage(text);
  messageInput.value = '';
  messageInput.style.height = 'auto';
  charCount.textContent = '0 / 2000';
}

// ─── Emoji picker ─────────────────────────────────────────────
const emojiBtn    = document.getElementById('emoji-btn');
const emojiPicker = document.getElementById('emoji-picker');

emojiBtn.addEventListener('click', e => {
  e.stopPropagation();
  emojiPicker.classList.toggle('hidden');
});

// ─── Block modal buttons ──────────────────────────────────────
document.getElementById('block-cancel').addEventListener('click', closeBlockModal);

document.getElementById('block-confirm').addEventListener('click', async () => {
  const username = state.ctxTarget?.authorUsername;
  if (!username) return;
  closeBlockModal();
  await blockUser(username);
});

// ─── Block / unblock API calls ────────────────────────────────
async function blockUser(username) {
  try {
    const res  = await fetch('/api/block', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ username }),
    });
    const data = await res.json();
    if (res.ok) {
      state.blocked.add(username);
      document.querySelectorAll(`[data-author="${username}"]`).forEach(el => el.style.display = 'none');
      renderMembers();
      showToast(`Blocked ${username}.`, 'warning');
    } else {
      showToast(data.error || 'Could not block user.', 'error');
    }
  } catch {
    showToast('Network error.', 'error');
  }
}

async function unblockUser(username) {
  try {
    const res  = await fetch('/api/unblock', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ username }),
    });
    const data = await res.json();
    if (res.ok) {
      state.blocked.delete(username);
      document.querySelectorAll(`[data-author="${username}"]`).forEach(el => el.style.display = '');
      renderMembers();
      showToast(`Unblocked ${username}.`, 'success');
    } else {
      showToast(data.error || 'Could not unblock.', 'error');
    }
  } catch {
    showToast('Network error.', 'error');
  }
}

// ─── Global click: close overlays ────────────────────────────
document.addEventListener('click', e => {
  const ctxMenu      = document.getElementById('ctx-menu');
  const reactionPop  = document.getElementById('reaction-popup');
  const blockModal   = document.getElementById('block-modal');

  if (!ctxMenu.contains(e.target))     closeCtxMenu();
  if (!reactionPop.contains(e.target)) closeReactionStrip();
  if (!emojiPicker.contains(e.target) && e.target !== emojiBtn)
    emojiPicker.classList.add('hidden');
  if (e.target === blockModal)         closeBlockModal();
});

// Escape key closes everything
document.addEventListener('keydown', e => {
  if (e.key === 'Escape') {
    closeCtxMenu();
    closeReactionStrip();
    closeBlockModal();
    emojiPicker.classList.add('hidden');
  }
});