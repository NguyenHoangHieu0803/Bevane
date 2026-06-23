// Profile tab: avatar (real upload), display name (editable via API),
// Change password, My QR, Log out.

import { state, setIdentity, clearAuth, emit } from './state.js';
import { api, ApiError } from './api.js';
import { $, el, clear, show, hide, toast, announce, announceAlert, comingSoon } from './ui.js';
import { toCanvas } from './vendor/qrcode.js';

function initials(name) {
  const parts = String(name || '?').trim().split(/\s+/).slice(0, 2);
  return parts.map((p) => p[0] ? p[0].toUpperCase() : '').join('') || '?';
}

function renderProfile() {
  // Main profile avatar
  const avatarEl = $('#profile-avatar');
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

  // Sidebar mini-avatar (#side-avatar)
  const sideAvatar = $('#side-avatar');
  if (sideAvatar) {
    while (sideAvatar.firstChild) sideAvatar.removeChild(sideAvatar.firstChild);
    if (state.avatarUrl) {
      const img = document.createElement('img');
      img.src = state.avatarUrl;
      img.alt = '';
      sideAvatar.appendChild(img);
    } else {
      sideAvatar.textContent = initials(state.displayName);
    }
  }

  // Wallpaper clear button visibility
  const clearBtn = $('#profile-wallpaper-clear-btn');
  if (clearBtn) clearBtn.hidden = !state.wallpaperUrl;
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
        // Cover: maintain aspect ratio, crop center to fit target dimensions (no distortion).
        const srcAspect = img.naturalWidth / img.naturalHeight;
        const dstAspect = w / h;
        let sw, sh, sx = 0, sy = 0;
        if (srcAspect > dstAspect) {
          sh = img.naturalHeight; sw = sh * dstAspect; sx = (img.naturalWidth - sw) / 2;
        } else {
          sw = img.naturalWidth; sh = sw / dstAspect; sy = (img.naturalHeight - sh) / 2;
        }
        ctx.drawImage(img, sx, sy, sw, sh, 0, 0, w, h);
        resolve(canvas.toDataURL('image/jpeg', quality));
      };
      img.src = e.target.result;
    };
    reader.readAsDataURL(file);
  });
}

// ----------------------------------------------------------------- Chat wallpaper editor
let _wpImg = null, _wpX = 0, _wpY = 0, _wpScale = 1;
let _wpDrag = false, _wpLX = 0, _wpLY = 0;
let _wpPinchD = null, _wpPinchS = null;

function _wpVp() { return document.getElementById('wpeditor-viewport'); }

function _wpApply() {
  const img = document.getElementById('wpeditor-img');
  const iw = _wpImg.naturalWidth * _wpScale;
  const ih = _wpImg.naturalHeight * _wpScale;
  img.style.left   = _wpX + 'px';
  img.style.top    = _wpY + 'px';
  img.style.width  = iw + 'px';
  img.style.height = ih + 'px';
}

function _wpSetScale(newScale, pivotX, pivotY) {
  const vp = _wpVp();
  if (pivotX === undefined) { pivotX = vp.offsetWidth / 2; pivotY = vp.offsetHeight / 2; }
  const clamped = Math.max(0.05, Math.min(20, newScale));
  const f = clamped / _wpScale;
  _wpX = pivotX - f * (pivotX - _wpX);
  _wpY = pivotY - f * (pivotY - _wpY);
  _wpScale = clamped;
  _wpApply();
  document.getElementById('wpeditor-slider').value = Math.round(_wpScale * 100);
}

function _wpContain() {
  const vp = _wpVp();
  const vw = vp.offsetWidth, vh = vp.offsetHeight;
  const iw = _wpImg.naturalWidth, ih = _wpImg.naturalHeight;
  _wpScale = Math.min(vw / iw, vh / ih);
  _wpX = (vw - iw * _wpScale) / 2;
  _wpY = (vh - ih * _wpScale) / 2;
  _wpApply();
  document.getElementById('wpeditor-slider').value = Math.round(_wpScale * 100);
}

function _openWpEditorWithSrc(src) {
  const editor = document.getElementById('wallpaper-editor');
  const img    = document.getElementById('wpeditor-img');
  _wpImg = new Image();
  _wpImg.onload = () => {
    img.src = src;
    editor.hidden = false;
    // Wait one frame so the viewport has its final layout dimensions
    requestAnimationFrame(() => _wpContain());
  };
  _wpImg.src = src;
}

function openWallpaperPicker() {
  const input = document.createElement('input');
  input.type = 'file'; input.accept = 'image/*'; input.style.display = 'none';
  document.body.appendChild(input);
  input.addEventListener('change', () => {
    document.body.removeChild(input);
    const file = input.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (e) => _openWpEditorWithSrc(e.target.result);
    reader.readAsDataURL(file);
  });
  input.click();
}

async function clearWallpaper() {
  const btn = $('#profile-wallpaper-clear-btn');
  btn.disabled = true;
  try {
    await api.updateProfile(undefined, undefined, '');
    state.wallpaperUrl = null;
    renderProfile();
    toast('Wallpaper removed.');
  } catch (err) {
    toast('Could not remove wallpaper.');
  } finally {
    btn.disabled = false;
  }
}

async function _wpSave() {
  const vp = _wpVp();
  const vw = vp.offsetWidth, vh = vp.offsetHeight;
  const outW = Math.min(vw, 900), outH = Math.round(vh * (outW / vw));
  const sc   = outW / vw;
  const canvas = document.createElement('canvas');
  canvas.width = outW; canvas.height = outH;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#000';
  ctx.fillRect(0, 0, outW, outH);
  ctx.save();
  ctx.scale(sc, sc);
  ctx.drawImage(_wpImg, _wpX, _wpY, _wpImg.naturalWidth * _wpScale, _wpImg.naturalHeight * _wpScale);
  ctx.restore();
  const dataUrl = canvas.toDataURL('image/jpeg', 0.85);

  document.getElementById('wallpaper-editor').hidden = true;
  const btn = $('#profile-wallpaper-btn');
  btn.disabled = true; btn.textContent = 'Đang lưu…';
  try {
    await api.updateProfile(undefined, undefined, dataUrl);
    state.wallpaperUrl = dataUrl;
    renderProfile();
    toast('Đã cập nhật hình nền chat.');
  } catch (err) {
    toast(err instanceof ApiError ? err.message : 'Không lưu được hình nền.');
  } finally {
    btn.disabled = false; btn.textContent = '🖼️ Set chat wallpaper';
  }
}

function initWpEditor() {
  const vp = _wpVp();

  // Mouse drag
  vp.addEventListener('mousedown', (e) => { _wpDrag = true; _wpLX = e.clientX; _wpLY = e.clientY; vp.classList.add('dragging'); });
  window.addEventListener('mousemove', (e) => {
    if (!_wpDrag) return;
    _wpX += e.clientX - _wpLX; _wpY += e.clientY - _wpLY;
    _wpLX = e.clientX; _wpLY = e.clientY;
    _wpApply();
  });
  window.addEventListener('mouseup', () => { _wpDrag = false; vp.classList.remove('dragging'); });

  // Scroll to zoom
  vp.addEventListener('wheel', (e) => {
    e.preventDefault();
    const r = vp.getBoundingClientRect();
    _wpSetScale(_wpScale * (e.deltaY > 0 ? 0.9 : 1.1), e.clientX - r.left, e.clientY - r.top);
  }, { passive: false });

  // Touch drag + pinch zoom
  vp.addEventListener('touchstart', (e) => {
    e.preventDefault();
    if (e.touches.length === 1) {
      _wpDrag = true; _wpPinchD = null;
      _wpLX = e.touches[0].clientX; _wpLY = e.touches[0].clientY;
    } else if (e.touches.length === 2) {
      _wpDrag = false;
      _wpPinchD = Math.hypot(e.touches[0].clientX - e.touches[1].clientX, e.touches[0].clientY - e.touches[1].clientY);
      _wpPinchS = _wpScale;
    }
  }, { passive: false });

  vp.addEventListener('touchmove', (e) => {
    e.preventDefault();
    if (e.touches.length === 1 && _wpDrag) {
      _wpX += e.touches[0].clientX - _wpLX; _wpY += e.touches[0].clientY - _wpLY;
      _wpLX = e.touches[0].clientX; _wpLY = e.touches[0].clientY;
      _wpApply();
    } else if (e.touches.length === 2 && _wpPinchD) {
      const d  = Math.hypot(e.touches[0].clientX - e.touches[1].clientX, e.touches[0].clientY - e.touches[1].clientY);
      const cx = (e.touches[0].clientX + e.touches[1].clientX) / 2;
      const cy = (e.touches[0].clientY + e.touches[1].clientY) / 2;
      const r  = vp.getBoundingClientRect();
      _wpSetScale(_wpPinchS * (d / _wpPinchD), cx - r.left, cy - r.top);
    }
  }, { passive: false });

  vp.addEventListener('touchend', (e) => {
    if (e.touches.length < 2) _wpPinchD = null;
    if (e.touches.length === 0) { _wpDrag = false; vp.classList.remove('dragging'); }
  });

  // Controls
  document.getElementById('wpeditor-slider').addEventListener('input', (e) => _wpSetScale(Number(e.target.value) / 100));
  document.getElementById('wpeditor-zoom-in').addEventListener('click',  () => _wpSetScale(_wpScale * 1.25));
  document.getElementById('wpeditor-zoom-out').addEventListener('click', () => _wpSetScale(_wpScale / 1.25));
  document.getElementById('wpeditor-reset').addEventListener('click',    () => _wpContain());
  document.getElementById('wpeditor-cancel').addEventListener('click',   () => { document.getElementById('wallpaper-editor').hidden = true; });
  document.getElementById('wpeditor-done').addEventListener('click',     () => _wpSave());

  // Close on Escape
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && !document.getElementById('wallpaper-editor').hidden) {
      document.getElementById('wallpaper-editor').hidden = true;
    }
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
  initWpEditor();

  $('#profile-qr-btn').addEventListener('click', openQr);
  $('#qr-close').addEventListener('click', closeQr);
  $('#qr-dialog').addEventListener('keydown', (e) => { if (e.key === 'Escape') closeQr(); });

  $('#profile-editname-btn').addEventListener('click', openEditName);
  $('#editname-form').addEventListener('submit', saveName);
  $('#editname-cancel').addEventListener('click', closeEditName);
  $('#editname-dialog').addEventListener('keydown', (e) => { if (e.key === 'Escape') closeEditName(); });

  $('#profile-avatar-btn').addEventListener('click', openAvatarPicker);

  $('#profile-wallpaper-btn').addEventListener('click', openWallpaperPicker);
  $('#profile-wallpaper-clear-btn').addEventListener('click', clearWallpaper);

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
