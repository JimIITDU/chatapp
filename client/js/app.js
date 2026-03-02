/* app.js — Entry point */
'use strict';

let _typingTimer; // declared here so app.js input handler can use it

function launchApp() {
  initTheme();
  document.getElementById('auth-screen').classList.add('hidden');
  document.getElementById('app').classList.remove('hidden');
  buildEmojiPicker();
  connectSocket();
}

// ── Theme ─────────────────────────────────────────────────────
document.getElementById('theme-toggle').addEventListener('click', toggleTheme);

// ── Room password prompt ──────────────────────────────────────
document.getElementById('pw-prompt-submit').addEventListener('click', doSubmitRoomPw);
document.getElementById('room-password-input').addEventListener('keydown', e => {
  if (e.key === 'Enter') doSubmitRoomPw();
  if (e.key === 'Escape') closePasswordPrompt();
});
document.getElementById('pw-prompt-cancel').addEventListener('click', closePasswordPrompt);

function doSubmitRoomPw() {
  const modal  = document.getElementById('pw-prompt-modal');
  const roomId = modal._roomId;
  const pw     = document.getElementById('room-password-input').value.trim();
  if (!pw) { showPasswordError('Enter the room password.'); return; }
  submitRoomPassword(roomId, pw);
}

// ── Search ────────────────────────────────────────────────────
document.getElementById('search-input').addEventListener('input', e => renderConvoList(e.target.value));

// ── Message input ─────────────────────────────────────────────
const msgInput = document.getElementById('message-input');
const charCount= document.getElementById('char-count');

msgInput.addEventListener('input', () => {
  msgInput.style.height = 'auto';
  msgInput.style.height = Math.min(msgInput.scrollHeight, 120) + 'px';
  charCount.textContent = `${msgInput.value.length}/2000`;
  clearTimeout(_typingTimer);
  sendTypingStart();
  _typingTimer = setTimeout(sendTypingStop, 1500);
});

msgInput.addEventListener('keydown', e => {
  if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); doSend(); }
});
document.getElementById('send-btn').addEventListener('click', doSend);

function doSend() {
  const text = msgInput.value.trim();
  if (!text) return;
  sendMessage(text);
  msgInput.value = '';
  msgInput.style.height = 'auto';
  charCount.textContent = '0/2000';
}

// ── Emoji ─────────────────────────────────────────────────────
const emojiBtn    = document.getElementById('emoji-btn');
const emojiPicker = document.getElementById('emoji-picker');
emojiBtn.addEventListener('click', e => { e.stopPropagation(); emojiPicker.classList.toggle('hidden'); });

// ── Members panel toggle ──────────────────────────────────────
document.getElementById('members-toggle').addEventListener('click', () => {
  const mp = document.getElementById('members-panel');
  if (!mp) return;
  state.showMembers = !state.showMembers;
  mp.classList.toggle('hidden', !state.showMembers);
  if (state.showMembers) renderMembers();
});

// ── Block modal ───────────────────────────────────────────────
document.getElementById('block-cancel').addEventListener('click', closeBlockModal);
document.getElementById('block-confirm').addEventListener('click', async () => {
  const un = state.ctxTarget?.authorUsername;
  if (!un) return;
  closeBlockModal();
  await blockUser(un);
});

async function blockUser(username) {
  try {
    const res  = await fetch('/api/block', {
      method:'POST', headers:{'Content-Type':'application/json','Authorization':`Bearer ${token}`},
      body: JSON.stringify({ username }),
    });
    const data = await res.json();
    if (res.ok) {
      state.blocked.add(username);
      document.querySelectorAll(`[data-author="${username}"]`).forEach(el => el.style.display='none');
      renderMembers();
      showToast(`Blocked ${username}.`, 'warning');
    } else showToast(data.error||'Could not block.', 'error');
  } catch { showToast('Network error.', 'error'); }
}

async function unblockUser(username) {
  try {
    const res  = await fetch('/api/unblock', {
      method:'POST', headers:{'Content-Type':'application/json','Authorization':`Bearer ${token}`},
      body: JSON.stringify({ username }),
    });
    const data = await res.json();
    if (res.ok) {
      state.blocked.delete(username);
      document.querySelectorAll(`[data-author="${username}"]`).forEach(el => el.style.display='');
      renderMembers();
      showToast(`Unblocked ${username}.`, 'success');
    } else showToast(data.error||'Could not unblock.', 'error');
  } catch { showToast('Network error.', 'error'); }
}

// ── Global click ──────────────────────────────────────────────
document.addEventListener('click', e => {
  if (!document.getElementById('ctx-menu').contains(e.target))       closeCtxMenu();
  if (!document.getElementById('reaction-popup').contains(e.target)) closeReactionStrip();
  if (!emojiPicker.contains(e.target) && e.target !== emojiBtn)      emojiPicker.classList.add('hidden');
  if (e.target === document.getElementById('block-modal'))           closeBlockModal();
  if (e.target === document.getElementById('pw-prompt-modal'))       closePasswordPrompt();
});
document.addEventListener('keydown', e => {
  if (e.key==='Escape') {
    closeCtxMenu(); closeReactionStrip(); closeBlockModal(); closePasswordPrompt();
    emojiPicker.classList.add('hidden');
  }
});