// Shared client state + tiny event bus.
// Identity and session token persist across page loads.
// "Remember me" → localStorage; no "remember me" → sessionStorage.

const KEY_TOKEN   = 'bevane.token';
const KEY_ID      = 'bevane.userId';
const KEY_NAME    = 'bevane.displayName';
const KEY_REMEMBER = 'bevane.remember';

export const state = {
  userId:               null,
  displayName:          null,
  token:                null,
  activeConversationId: null,
  activePeer:           null,
  presence:             new Map(),
};

// Set full auth credentials (called after login or register).
export function setAuth(id, displayName, token, remember = true) {
  state.userId      = id;
  state.displayName = displayName;
  state.token       = token;
  const storage = remember ? localStorage : sessionStorage;
  try {
    storage.setItem(KEY_TOKEN,    token);
    storage.setItem(KEY_ID,       id);
    storage.setItem(KEY_NAME,     displayName);
    storage.setItem(KEY_REMEMBER, remember ? '1' : '0');
  } catch { /* storage may be unavailable (private mode) */ }
}

// Clear all auth state (called on logout).
export function clearAuth() {
  state.userId               = null;
  state.displayName          = null;
  state.token                = null;
  state.activeConversationId = null;
  state.activePeer           = null;
  state.presence.clear();
  try {
    for (const k of [KEY_TOKEN, KEY_ID, KEY_NAME, KEY_REMEMBER]) {
      localStorage.removeItem(k);
      sessionStorage.removeItem(k);
    }
  } catch { /* noop */ }
}

// Restore auth from storage on page load. Returns true if credentials found.
export function loadStoredAuth() {
  const token       = _read(KEY_TOKEN);
  const userId      = _read(KEY_ID);
  const displayName = _read(KEY_NAME);
  if (token && userId) {
    state.token       = token;
    state.userId      = userId;
    state.displayName = displayName || userId;
    return true;
  }
  return false;
}

// Kept for profile name edits (local display-name update only).
export function setIdentity(id, displayName) {
  state.userId      = id;
  state.displayName = displayName;
  try {
    const storage = localStorage.getItem(KEY_REMEMBER) !== '0' ? localStorage : sessionStorage;
    storage.setItem(KEY_ID,   id);
    storage.setItem(KEY_NAME, displayName);
  } catch { /* noop */ }
}

export function isRegistered() {
  return Boolean(state.userId && state.token);
}

function _read(key) {
  try { return localStorage.getItem(key) || sessionStorage.getItem(key); }
  catch { return null; }
}

// Minimal pub/sub so feature modules stay decoupled.
const listeners = new Map();
export function on(event, fn) {
  if (!listeners.has(event)) listeners.set(event, new Set());
  listeners.get(event).add(fn);
  return () => listeners.get(event).delete(fn);
}
export function emit(event, payload) {
  const set = listeners.get(event);
  if (set) for (const fn of set) {
    try { fn(payload); } catch (e) { console.error('[bevane] listener error', event, e); }
  }
}
