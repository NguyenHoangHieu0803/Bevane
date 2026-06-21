// Small DOM + a11y helpers shared across feature modules.

export const $ = (sel, root = document) => root.querySelector(sel);
export const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));

export function show(el) { if (el) el.hidden = false; }
export function hide(el) { if (el) el.hidden = true; }

// Responsive breakpoint helper. Mirrors the CSS two-pane breakpoint (768px):
// at/above it, Chats and Notes render both panes side-by-side, so feature
// modules must NOT hide the list pane when a thread/editor opens. Below it the
// app is single-column and the list pane is hidden to reveal the detail pane.
// `matchMedia` stays live across resize / devtools device mode.
const twoPaneMQ = (typeof window !== 'undefined' && window.matchMedia)
  ? window.matchMedia('(min-width: 768px)')
  : null;
export function isTwoPane() { return !!(twoPaneMQ && twoPaneMQ.matches); }
export function onTwoPaneChange(fn) {
  if (!twoPaneMQ) return;
  // addEventListener('change') is the modern API; addListener is the fallback.
  if (twoPaneMQ.addEventListener) twoPaneMQ.addEventListener('change', fn);
  else if (twoPaneMQ.addListener) twoPaneMQ.addListener(fn);
}

export function clear(el) { while (el && el.firstChild) el.removeChild(el.firstChild); }

// Create an element with attributes + children. Text via {text}.
export function el(tag, attrs = {}, children = []) {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (k === 'text') node.textContent = v;
    else if (k === 'html') node.innerHTML = v;
    else if (k === 'class') node.className = v;
    else if (k.startsWith('on') && typeof v === 'function') {
      node.addEventListener(k.slice(2).toLowerCase(), v);
    } else if (v === true) node.setAttribute(k, '');
    else if (v !== false && v != null) node.setAttribute(k, v);
  }
  for (const c of [].concat(children)) {
    if (c == null) continue;
    node.appendChild(typeof c === 'string' ? document.createTextNode(c) : c);
  }
  return node;
}

// --- Live regions (A4) ---
export function announce(text) {
  const r = document.getElementById('live-region');
  if (r) { r.textContent = ''; requestAnimationFrame(() => { r.textContent = text; }); }
}
export function announceAlert(text) {
  const r = document.getElementById('alert-region');
  if (r) { r.textContent = ''; requestAnimationFrame(() => { r.textContent = text; }); }
}

let toastTimer = null;
export function toast(text) {
  const t = document.getElementById('toast');
  if (!t) return;
  t.textContent = text;
  t.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { t.hidden = true; }, 3200);
}

// Shared "no dead buttons" helper. Every control that isn't functional yet
// MUST route here so the user gets visible + announced feedback.
export function comingSoon(label) {
  const msg = `${label || 'This feature'} — coming soon`;
  toast(msg);
  announce(msg);
}

// --- Formatting ---
export function fmtTime(ms) {
  const d = new Date(ms);
  return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}
export function fmtDateTime(ms) {
  const d = new Date(ms);
  return d.toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
}
export function fmtDuration(sec) {
  if (!sec || sec < 0) return '0:00';
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return `${m}:${String(s).padStart(2, '0')}`;
}

export function uuid() {
  if (crypto.randomUUID) return crypto.randomUUID();
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    return (c === 'x' ? r : (r & 0x3) | 0x8).toString(16);
  });
}
