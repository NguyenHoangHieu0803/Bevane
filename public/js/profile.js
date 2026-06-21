// Profile tab: avatar (initials), display name (editable -> localStorage),
// My QR (WORKING, real QR), Scan QR (stub), change password / notifications /
// avatar upload (stubs), Log out (WORKING — clears identity + reloads).

import { state, setIdentity, clearAuth } from './state.js';
import { api } from './api.js';
import { $, el, clear, show, hide, toast, announce, comingSoon } from './ui.js';
import { toCanvas } from './vendor/qrcode.js';

function initials(name) {
  const parts = String(name || '?').trim().split(/\s+/).slice(0, 2);
  return parts.map((p) => p[0] ? p[0].toUpperCase() : '').join('') || '?';
}

function renderProfile() {
  $('#profile-avatar').textContent = initials(state.displayName);
  $('#profile-display-name').textContent = state.displayName || '—';
  $('#profile-id').textContent = state.userId || '';
}

// ----------------------------------------------------------------- My QR
function qrPayload() {
  return `bevane:user/${state.userId}`;
}

function openQr() {
  const dlg = $('#qr-dialog');
  const canvas = $('#qr-canvas');
  try {
    toCanvas(canvas, qrPayload(), { scale: 6, margin: 4, dark: '#0b1220', light: '#ffffff' });
    $('#qr-payload').textContent = qrPayload();
    show(dlg);
    $('#qr-close').focus();
    announce('Your QR code is shown. Others can scan it to add you.');
  } catch (e) {
    comingSoon('My QR code');
  }
}
function closeQr() {
  hide($('#qr-dialog'));
  $('#profile-qr-btn').focus();
}

// ----------------------------------------------------------------- Edit name
function openEditName() {
  const dlg = $('#editname-dialog');
  $('#editname-input').value = state.displayName || '';
  show(dlg);
  $('#editname-input').focus();
}
function closeEditName() {
  hide($('#editname-dialog'));
  $('#profile-editname-btn').focus();
}
function saveName(e) {
  e.preventDefault();
  const name = $('#editname-input').value.trim();
  if (!name) { toast('Please enter a display name.'); return; }
  if (name.length > 40) { toast('Display name must be 40 characters or fewer.'); return; }
  setIdentity(state.userId, name); // keep id, change name (local-only this round)
  renderProfile();
  $('#self-name').textContent = name;
  const sideName = $('#side-self-name');
  if (sideName) sideName.textContent = name;
  closeEditName();
  toast('Display name updated.');
  announce('Display name updated.');
}

// ----------------------------------------------------------------- Log out
async function logout() {
  if (!confirm('Log out of Bevane?')) return;
  try { await api.logout(); } catch { /* server may be unreachable; clear locally anyway */ }
  clearAuth();
  location.reload();
}

// ----------------------------------------------------------------- wiring
export function initProfile() {
  renderProfile();

  $('#profile-qr-btn').addEventListener('click', openQr);
  $('#qr-close').addEventListener('click', closeQr);
  $('#qr-dialog').addEventListener('keydown', (e) => { if (e.key === 'Escape') closeQr(); });

  $('#profile-editname-btn').addEventListener('click', openEditName);
  $('#editname-form').addEventListener('submit', saveName);
  $('#editname-cancel').addEventListener('click', closeEditName);
  $('#editname-dialog').addEventListener('keydown', (e) => { if (e.key === 'Escape') closeEditName(); });

  $('#profile-logout-btn').addEventListener('click', logout);

  // Stubs — every one routes to comingSoon (no dead buttons).
  $('#profile-scanqr-btn').addEventListener('click', () => comingSoon('Scan QR'));
  $('#profile-avatar-btn').addEventListener('click', () => comingSoon('Avatar upload'));
  $('#profile-password-btn').addEventListener('click', () => comingSoon('Change password'));

  // Notification setting toggles are visual stubs.
  for (const t of document.querySelectorAll('.notif-toggle')) {
    t.addEventListener('change', () => {
      comingSoon(`${t.dataset.label || 'Notification setting'} (${t.checked ? 'on' : 'off'})`);
    });
  }
}

export function refreshProfile() { renderProfile(); }
