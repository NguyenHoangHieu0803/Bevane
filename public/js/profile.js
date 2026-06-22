// Profile tab: avatar (real upload), display name (editable via API),
// Change password, My QR, Log out.

import { state, setIdentity, clearAuth } from './state.js';
import { api, ApiError } from './api.js';
import { $, el, clear, show, hide, toast, announce, announceAlert, comingSoon } from './ui.js';
import { toCanvas } from './vendor/qrcode.js';

function initials(name) {
  const parts = String(name || '?').trim().split(/\s+/).slice(0, 2);
  return parts.map((p) => p[0] ? p[0].toUpperCase() : '').join('') || '?';
}

function renderProfile() {
  const avatarEl = $('#profile-avatar');
  // Clear previous content
  while (avatarEl.firstChild) avatarEl.removeChild(avatarEl.firstChild);
  if (state.avatarUrl) {
    const img = document.createElement('img');
    img.src = state.avatarUrl;
    img.alt = '';
    img.className = 'profile-avatar__img';
    avatarEl.appendChild(img);
  } else {
    avatarEl.textContent = initials(state.displayName);
  }
  $('#profile-display-name').textContent = state.displayName || '—';
}

// ----------------------------------------------------------------- My QR
function qrPayload() { return `bevane:user/${state.userId}`; }

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
function closeQr() { hide($('#qr-dialog')); $('#profile-qr-btn').focus(); }

// ----------------------------------------------------------------- Edit name
function openEditName() {
  $('#editname-input').value = state.displayName || '';
  show($('#editname-dialog'));
  $('#editname-input').focus();
}
function closeEditName() { hide($('#editname-dialog')); $('#profile-editname-btn').focus(); }

async function saveName(e) {
  e.preventDefault();
  const name = $('#editname-input').value.trim();
  if (!name) { toast('Please enter a display name.'); return; }
  if (name.length > 40) { toast('Display name must be 40 characters or fewer.'); return; }
  const btn = $('#editname-form').querySelector('button[type="submit"]');
  btn.disabled = true;
  try {
    await api.updateProfile(name, undefined);
    setIdentity(state.userId, name);
    state.displayName = name;
    renderProfile();
    $('#self-name').textContent = name;
    const sideName = $('#side-self-name');
    if (sideName) sideName.textContent = name;
    closeEditName();
    toast('Display name updated.');
    announce('Display name updated.');
  } catch (err) {
    toast(err instanceof ApiError ? err.message : 'Could not update display name.');
  } finally {
    btn.disabled = false;
  }
}

// ----------------------------------------------------------------- Change avatar
function openAvatarPicker() {
  const input = document.createElement('input');
  input.type = 'file';
  input.accept = 'image/*';
  input.style.display = 'none';
  document.body.appendChild(input);
  input.addEventListener('change', async () => {
    document.body.removeChild(input);
    const file = input.files[0];
    if (file) await processAvatarFile(file);
  });
  input.click();
}

async function processAvatarFile(file) {
  const btn = $('#profile-avatar-btn');
  btn.disabled = true;
  btn.textContent = 'Uploading…';
  try {
    const dataUrl = await resizeImageToDataUrl(file, 200, 200, 0.82);
    await api.updateProfile(undefined, dataUrl);
    state.avatarUrl = dataUrl;
    renderProfile();
    toast('Avatar updated.');
    announce('Avatar updated.');
  } catch (err) {
    toast(err instanceof ApiError ? err.message : 'Could not update avatar.');
  } finally {
    btn.disabled = false;
    btn.textContent = 'Change avatar';
  }
}

function resizeImageToDataUrl(file, w, h, quality) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = reject;
    reader.onload = (e) => {
      const img = new Image();
      img.onerror = reject;
      img.onload = () => {
        const canvas = document.createElement('canvas');
        canvas.width = w; canvas.height = h;
        const ctx = canvas.getContext('2d');
        // Center-crop to square then scale
        const size = Math.min(img.naturalWidth, img.naturalHeight);
        const sx = (img.naturalWidth  - size) / 2;
        const sy = (img.naturalHeight - size) / 2;
        ctx.drawImage(img, sx, sy, size, size, 0, 0, w, h);
        resolve(canvas.toDataURL('image/jpeg', quality));
      };
      img.src = e.target.result;
    };
    reader.readAsDataURL(file);
  });
}

// ----------------------------------------------------------------- Change password
function openChangePassword() {
  $('#changepw-current').value = '';
  $('#changepw-new').value = '';
  $('#changepw-repeat').value = '';
  $('#changepw-error').textContent = '';
  show($('#changepw-dialog'));
  $('#changepw-current').focus();
}
function closeChangePassword() { hide($('#changepw-dialog')); $('#profile-password-btn').focus(); }

async function submitChangePassword(e) {
  e.preventDefault();
  const current = $('#changepw-current').value;
  const newPw   = $('#changepw-new').value;
  const repeat  = $('#changepw-repeat').value;
  const errEl   = $('#changepw-error');
  errEl.textContent = '';
  if (!current) { errEl.textContent = 'Enter your current password.'; $('#changepw-current').focus(); return; }
  if (newPw.length < 6) { errEl.textContent = 'New password must be at least 6 characters.'; $('#changepw-new').focus(); return; }
  if (newPw !== repeat) { errEl.textContent = 'Passwords do not match.'; $('#changepw-repeat').focus(); return; }
  const btn = $('#changepw-form').querySelector('button[type="submit"]');
  btn.disabled = true; btn.textContent = 'Changing…';
  try {
    await api.changePassword(current, newPw);
    closeChangePassword();
    toast('Password changed successfully.');
    announce('Password changed.');
  } catch (err) {
    errEl.textContent = err instanceof ApiError ? err.message : 'Could not change password.';
  } finally {
    btn.disabled = false; btn.textContent = 'Change password';
  }
}

// ----------------------------------------------------------------- Log out
async function logout() {
  if (!confirm('Log out of Bevane?')) return;
  try { await api.logout(); } catch { /* clear locally anyway */ }
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

  $('#profile-avatar-btn').addEventListener('click', openAvatarPicker);

  $('#profile-password-btn').addEventListener('click', openChangePassword);
  $('#changepw-form').addEventListener('submit', submitChangePassword);
  $('#changepw-cancel').addEventListener('click', closeChangePassword);
  $('#changepw-dialog').addEventListener('keydown', (e) => { if (e.key === 'Escape') closeChangePassword(); });

  $('#profile-logout-btn').addEventListener('click', logout);

  $('#profile-scanqr-btn').addEventListener('click', () => comingSoon('Scan QR'));

  for (const t of document.querySelectorAll('.notif-toggle')) {
    t.addEventListener('change', () => {
      comingSoon(`${t.dataset.label || 'Notification setting'} (${t.checked ? 'on' : 'off'})`);
    });
  }
}

export function refreshProfile() { renderProfile(); }
