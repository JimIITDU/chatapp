/* utils.js — Pure helpers */
'use strict';

const QUICK_REACTIONS = ['👍','❤️','😂','😮','😢','🔥'];
const EMOJIS = [
  '😀','😂','🥹','😍','🤩','😎','🥳','🤔','😤','🥺','❤️','🔥','👏','🎉','✅','💯','🚀','⭐','💡','🎯',
  '😅','🤣','😇','🤗','😈','💀','👻','🤖','👾','🎃','🐶','🐱','🦊','🐻','🦁','🐼','🦄','🐸','🐙','🦋',
  '🍕','🍔','🌮','🍜','🍣','🍦','☕','🧃','🎂','🎵','🌍','✈️','🏖️','🏔️','🎮','📱','💻','📚','🎨','🧪',
];

function escHtml(s) {
  return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;').replace(/\n/g,'<br>');
}

function fmtTime(iso) {
  return new Date(iso).toLocaleTimeString([],{hour:'2-digit',minute:'2-digit'});
}

function fmtDate(iso) {
  const d = new Date(iso);
  const now = new Date();
  const diff = now - d;
  if (diff < 60000)     return 'now';
  if (diff < 3600000)   return `${Math.floor(diff/60000)}m`;
  if (diff < 86400000)  return fmtTime(iso);
  if (diff < 604800000) return d.toLocaleDateString([],{weekday:'short'});
  return d.toLocaleDateString([],{month:'short',day:'numeric'});
}

function isConsecutive(msg, prev) {
  if (!prev || msg.type !== 'user' || prev.type !== 'user') return false;
  const sameAuthor = msg.author?.id === prev.author?.id || msg.from?.username === prev.from?.username;
  if (!sameAuthor) return false;
  return (new Date(msg.timestamp) - new Date(prev.timestamp)) < 60000;
}

function setLoading(btnId, loading) {
  const btn = document.getElementById(btnId);
  if (!btn) return;
  btn.disabled = loading;
  const sp = btn.querySelector('.btn-spinner');
  const lb = btn.querySelector('span');
  if (sp) sp.classList.toggle('hidden', !loading);
  if (lb) lb.style.opacity = loading ? '0.5' : '1';
}

function showAuthError(id, msg) {
  const el = document.getElementById(id);
  if (!el) return;
  el.textContent = msg;
  el.classList.remove('hidden');
}

let _toastTimer;
function showToast(msg, type = 'info') {
  const el = document.getElementById('toast');
  if (!el) return;
  clearTimeout(_toastTimer);
  el.textContent = msg;
  el.className = `toast ${type} show`;
  _toastTimer = setTimeout(() => el.classList.remove('show'), 3500);
}