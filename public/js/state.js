// Shared client state + tiny event bus. Identity persists in localStorage.

const LS_ID = 'bevane.userId';
const LS_NAME = 'bevane.displayName';

export const state = {
  userId: localStorage.getItem(LS_ID) || null,
  displayName: localStorage.getItem(LS_NAME) || null,
  // Active conversation context for the chat view.
  activeConversationId: null,
  activePeer: null, // { id, displayName, online }
  // Live presence map: userId -> boolean.
  presence: new Map(),
};

export function setIdentity(id, displayName) {
  state.userId = id;
  state.displayName = displayName;
  localStorage.setItem(LS_ID, id);
  localStorage.setItem(LS_NAME, displayName);
}

export function isRegistered() {
  return Boolean(state.userId);
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
