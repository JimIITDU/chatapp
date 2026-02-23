/* auth.js — Authentication UI */
'use strict';

let token = localStorage.getItem('chat_token') || null;

function clearToken() {
  token = null;
  localStorage.removeItem('chat_token');
}

// ─── Tab switching ────────────────────────────────────────────
document.querySelectorAll('.auth-tab').forEach(tab => {
  tab.addEventListener('click', () => {
    document.querySelectorAll('.auth-tab').forEach(t => t.classList.remove('active'));
    tab.classList.add('active');
    document.getElementById('login-form').classList.toggle('hidden',    tab.dataset.tab !== 'login');
    document.getElementById('register-form').classList.toggle('hidden', tab.dataset.tab !== 'register');
    // Clear errors
    document.getElementById('login-error').classList.add('hidden');
    document.getElementById('reg-error').classList.add('hidden');
  });
});

// ─── Password show/hide ───────────────────────────────────────
document.querySelectorAll('.pw-toggle').forEach(btn => {
  btn.addEventListener('click', () => {
    const input = document.getElementById(btn.dataset.target);
    const show  = input.type === 'password';
    input.type  = show ? 'text' : 'password';
    btn.querySelector('.eye-open').classList.toggle('hidden',   show);
    btn.querySelector('.eye-closed').classList.toggle('hidden', !show);
  });
});

// ─── Password strength ────────────────────────────────────────
document.getElementById('reg-password').addEventListener('input', () => {
  const pw   = document.getElementById('reg-password').value;
  const fill = document.getElementById('strength-fill');
  const lbl  = document.getElementById('strength-label');

  let score = 0;
  if (pw.length >= 8)              score++;
  if (/[A-Z]/.test(pw))           score++;
  if (/[a-z]/.test(pw))           score++;
  if (/[0-9]/.test(pw))           score++;
  if (/[^A-Za-z0-9]/.test(pw))   score++;

  const colors = ['','#EF4444','#F97316','#F59E0B','#10B981','#3B82F6'];
  const labels = ['','Very weak','Weak','Fair','Strong','Very strong'];
  fill.style.width      = `${(score / 5) * 100}%`;
  fill.style.background = colors[score] || '';
  lbl.textContent       = score > 0 ? labels[score] : '';
  lbl.style.color       = colors[score] || '';

  validateRegForm();
});

document.getElementById('reg-confirm').addEventListener('input', validateRegForm);
document.getElementById('reg-username').addEventListener('input', validateRegForm);

function validateRegForm() {
  const user  = document.getElementById('reg-username').value.trim();
  const pw    = document.getElementById('reg-password').value;
  const conf  = document.getElementById('reg-confirm').value;
  const match = document.getElementById('pw-match');

  const validUser = /^[a-zA-Z0-9_]{2,24}$/.test(user);
  const validPw   = pw.length >= 8 && /[A-Z]/.test(pw) && /[a-z]/.test(pw) && /[0-9]/.test(pw);
  const pwsMatch  = conf.length > 0 && pw === conf;

  if (conf.length > 0) {
    match.classList.remove('hidden');
    match.classList.toggle('ok',  pwsMatch);
    match.classList.toggle('bad', !pwsMatch);
    match.textContent = pwsMatch ? '✓ Passwords match' : '✗ Passwords do not match';
  } else {
    match.classList.add('hidden');
  }

  document.getElementById('register-btn').disabled = !(validUser && validPw && pwsMatch);
}

// ─── Login ────────────────────────────────────────────────────
document.getElementById('login-btn').addEventListener('click', doLogin);
document.getElementById('login-password').addEventListener('keydown', e => { if (e.key === 'Enter') doLogin(); });
document.getElementById('login-username').addEventListener('keydown', e => { if (e.key === 'Enter') document.getElementById('login-password').focus(); });

async function doLogin() {
  const username = document.getElementById('login-username').value.trim();
  const password = document.getElementById('login-password').value;
  document.getElementById('login-error').classList.add('hidden');

  if (!username || !password) {
    showAuthError('login-error', 'Please enter username and password.');
    return;
  }

  setLoading('login-btn', true);
  try {
    const res  = await fetch('/api/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password }),
    });
    const data = await res.json();
    if (!res.ok) { showAuthError('login-error', data.error || 'Login failed.'); return; }
    token = data.token;
    localStorage.setItem('chat_token', token);
    launchApp();
  } catch {
    showAuthError('login-error', 'Could not connect to server.');
  } finally {
    setLoading('login-btn', false);
  }
}

// ─── Register ─────────────────────────────────────────────────
document.getElementById('register-btn').addEventListener('click', doRegister);

async function doRegister() {
  const username = document.getElementById('reg-username').value.trim();
  const password = document.getElementById('reg-password').value;

  setLoading('register-btn', true);
  try {
    const res  = await fetch('/api/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password }),
    });
    const data = await res.json();
    if (!res.ok) { showAuthError('reg-error', data.error || 'Registration failed.'); return; }
    token = data.token;
    localStorage.setItem('chat_token', token);
    showToast('Account created! Welcome 🎉', 'success');
    launchApp();
  } catch {
    showAuthError('reg-error', 'Could not connect to server.');
  } finally {
    setLoading('register-btn', false);
  }
}

// ─── Logout ───────────────────────────────────────────────────
document.getElementById('logout-btn').addEventListener('click', () => {
  disconnectSocket();
  clearToken();
  resetState();
  document.getElementById('app').classList.add('hidden');
  document.getElementById('auth-screen').classList.remove('hidden');
  document.getElementById('login-username').value = '';
  document.getElementById('login-password').value = '';
  document.querySelector('.auth-tab[data-tab="login"]').click();
});

// ─── Auto-login on page load ──────────────────────────────────
if (token) {
  fetch('/api/me', { headers: { Authorization: `Bearer ${token}` } })
    .then(r => r.ok ? launchApp() : clearToken())
    .catch(clearToken);
}