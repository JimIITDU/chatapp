/* utils.js — Pure helper functions */
'use strict';

const QUICK_REACTIONS = ['👍','❤️','😂','😮','😢','🔥'];

const EMOJIS = [
  '😀','😂','🥹','😍','🤩','😎','🥳','🤔','😤','🥺',
  '❤️','🔥','👏','🎉','✅','💯','🚀','⭐','💡','🎯',
  '😅','🤣','😇','🤗','😈','💀','👻','🤖','👾','🎃',
  '🐶','🐱','🦊','🐻','🦁','🐼','🦄','🐸','🐙','🦋',
  '🍕','🍔','🌮','🍜','🍣','🍦','☕','🧃','🎂','🎵',
];

/** Escape HTML to prevent XSS */
function escHtml(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
    .replace(/\n/g, '<br>');
}

/** Format an ISO timestamp to HH:MM */
function fmtTime(iso) {
  return new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

/** True if two consecutive user messages should be grouped (same author, < 60s apart) */
function isConsecutive(msg, prev) {
  if (!prev || msg.type !== 'user' || prev.type !== 'user') return false;
  if (msg.author?.id !== prev.author?.id) return false;
  return (new Date(msg.timestamp) - new Date(prev.timestamp)) < 60_000;
}

/** Show/hide the spinner on an auth button */
function setLoading(btnId, loading) {
  const btn = document.getElementById(btnId);
  if (!btn) return;
  btn.disabled = loading;
  const spinner = btn.querySelector('.btn-spinner');
  const label   = btn.querySelector('span');
  if (spinner) spinner.classList.toggle('hidden', !loading);
  if (label)   label.style.opacity = loading ? '0.5' : '1';
}

/** Show an auth error message */
function showAuthError(id, msg) {
  const el = document.getElementById(id);
  if (!el) return;
  el.textContent = msg;
  el.classList.remove('hidden');
}

/** Toast notification */
let _toastTimer;
function showToast(msg, type = 'info') {
  const el = document.getElementById('toast');
  if (!el) return;
  clearTimeout(_toastTimer);
  el.textContent = msg;
  el.className = `toast ${type} show`;
  _toastTimer = setTimeout(() => el.classList.remove('show'), 3500);
}