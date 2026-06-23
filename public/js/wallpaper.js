// Wallpaper editor — fullscreen drag/zoom image picker.
// Call initWpEditor() once on page load, then openWallpaperPicker(onSave) to open.
// onSave(dataUrl) is called with the baked JPEG when the user confirms.

let _wpImg = null, _wpX = 0, _wpY = 0, _wpScale = 1;
let _wpDrag = false, _wpLX = 0, _wpLY = 0;
let _wpPinchD = null, _wpPinchS = null;
let _wpOnSave = null;

function _wpVp() { return document.getElementById('wpeditor-viewport'); }

function _wpApply() {
  const img = document.getElementById('wpeditor-img');
  img.style.left   = _wpX + 'px';
  img.style.top    = _wpY + 'px';
  img.style.width  = _wpImg.naturalWidth  * _wpScale + 'px';
  img.style.height = _wpImg.naturalHeight * _wpScale + 'px';
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

function _openEditorWithSrc(src) {
  const editor = document.getElementById('wallpaper-editor');
  const img    = document.getElementById('wpeditor-img');
  _wpImg = new Image();
  _wpImg.onload = () => {
    img.src = src;
    editor.hidden = false;
    requestAnimationFrame(() => _wpContain());
  };
  _wpImg.src = src;
}

function _wpBakeAndSave() {
  const vp  = _wpVp();
  const vw  = vp.offsetWidth, vh = vp.offsetHeight;
  const sc  = Math.min(1, 900 / vw);
  const cw  = Math.round(vw * sc), ch = Math.round(vh * sc);
  const cvs = document.createElement('canvas');
  cvs.width = cw; cvs.height = ch;
  const ctx = cvs.getContext('2d');
  ctx.fillStyle = '#000';
  ctx.fillRect(0, 0, cw, ch);
  ctx.save(); ctx.scale(sc, sc);
  ctx.drawImage(_wpImg, _wpX, _wpY, _wpImg.naturalWidth * _wpScale, _wpImg.naturalHeight * _wpScale);
  ctx.restore();
  const dataUrl = cvs.toDataURL('image/jpeg', 0.85);
  document.getElementById('wallpaper-editor').hidden = true;
  if (_wpOnSave) _wpOnSave(dataUrl);
}

export function initWpEditor() {
  const vp = _wpVp();

  // Mouse drag
  vp.addEventListener('mousedown', (e) => {
    _wpDrag = true; _wpLX = e.clientX; _wpLY = e.clientY; vp.classList.add('dragging');
  });
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

  // Touch drag + pinch
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
  document.getElementById('wpeditor-reset').addEventListener('click',    _wpContain);
  document.getElementById('wpeditor-cancel').addEventListener('click',   () => { document.getElementById('wallpaper-editor').hidden = true; });
  document.getElementById('wpeditor-done').addEventListener('click',     _wpBakeAndSave);
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && !document.getElementById('wallpaper-editor').hidden)
      document.getElementById('wallpaper-editor').hidden = true;
  });
}

export function openWallpaperPicker(onSave) {
  _wpOnSave = onSave;
  const input = document.createElement('input');
  input.type = 'file'; input.accept = 'image/*'; input.style.display = 'none';
  document.body.appendChild(input);
  input.addEventListener('change', () => {
    document.body.removeChild(input);
    const file = input.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (e) => _openEditorWithSrc(e.target.result);
    reader.readAsDataURL(file);
  });
  input.click();
}
