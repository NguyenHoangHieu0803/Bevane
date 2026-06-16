// Message-level interactions: emoji reactions (local/optimistic), reply quote,
// delete (local remove), unsend-for-everyone (stub). Backend has the fields
// (replyTo/reactions/deleted) as STORAGE ONLY — no setters this round — so all
// of these are client-only and clearly labeled.

import { $, el, clear, show, hide, toast, announce, comingSoon } from './ui.js';
import { emit } from './state.js';

const EMOJI = ['❤️', '👍', '😂', '😮', '😢', '🙏'];

// Local reaction store: messageId -> { emoji: count }
const localReactions = new Map();

let lastFocused = null;
let activeMsgId = null;
let activeMsgBody = '';

// ----------------------------------------------------------------- action sheet
function ensureSheet() {
  let sheet = $('#msg-action-sheet');
  if (sheet) return sheet;
  sheet = el('div', {
    id: 'msg-action-sheet', class: 'modal', role: 'dialog',
    'aria-modal': 'true', 'aria-label': 'Message actions', hidden: true,
  }, [
    el('div', { class: 'modal__card' }, [
      el('h2', { text: 'Message actions' }),
      el('div', { class: 'reaction-row', id: 'reaction-row', role: 'group', 'aria-label': 'React with an emoji' }),
      el('div', { class: 'msg-action-list' }, [
        actionBtn('reply', '↩︎ Reply', () => { emit('msg:reply', { id: activeMsgId, body: activeMsgBody }); closeSheet(); }),
        actionBtn('translate', '🌐 Translate', () => { emit('msg:translate', { id: activeMsgId, body: activeMsgBody }); closeSheet(); }),
        actionBtn('delete', '🗑️ Delete for me', () => { emit('msg:delete', { id: activeMsgId }); closeSheet(); }),
        actionBtn('unsend', '⊘ Unsend for everyone', () => { comingSoon('Unsend for everyone'); closeSheet(); }),
        actionBtn('forward', '➥ Forward', () => { comingSoon('Forward'); closeSheet(); }),
      ]),
      el('button', { id: 'msg-action-close', class: 'btn btn--secondary', type: 'button' }, ['Cancel']),
    ]),
  ]);
  document.body.appendChild(sheet);

  const row = $('#reaction-row', sheet);
  for (const e of EMOJI) {
    row.appendChild(el('button', {
      class: 'reaction-chip', type: 'button', 'aria-label': `React with ${e}`,
      onclick: () => { addReaction(activeMsgId, e); closeSheet(); },
    }, [e]));
  }
  $('#msg-action-close', sheet).addEventListener('click', closeSheet);
  sheet.addEventListener('keydown', (ev) => { if (ev.key === 'Escape') closeSheet(); });
  return sheet;
}

function actionBtn(name, label, fn) {
  return el('button', { class: 'msg-action', type: 'button', 'data-action': name, onclick: fn }, [label]);
}

export function openMessageActions(messageId, body) {
  const sheet = ensureSheet();
  lastFocused = document.activeElement;
  activeMsgId = messageId;
  activeMsgBody = body || '';
  show(sheet);
  $('#msg-action-close', sheet).focus();
}

function closeSheet() {
  hide($('#msg-action-sheet'));
  if (lastFocused && lastFocused.focus) lastFocused.focus();
}

// ----------------------------------------------------------------- reactions
function addReaction(messageId, emoji) {
  if (!messageId) return;
  const map = localReactions.get(messageId) || {};
  map[emoji] = (map[emoji] || 0) + 1;
  localReactions.set(messageId, map);
  renderReactions(messageId);
  toast(`Reacted ${emoji} (saved on this device)`);
  announce(`Reacted with ${emoji}. Reaction stored locally; syncing is coming soon.`);
}

export function renderReactions(messageId) {
  const li = document.querySelector(`.message[data-id="${CSS.escape(messageId)}"]`);
  if (!li) return;
  let bar = li.querySelector('.reactions-bar');
  const map = localReactions.get(messageId);
  if (!map || !Object.keys(map).length) { if (bar) bar.remove(); return; }
  if (!bar) {
    bar = el('span', { class: 'reactions-bar', 'aria-label': 'Reactions' });
    li.appendChild(bar);
  }
  clear(bar);
  for (const [emoji, count] of Object.entries(map)) {
    bar.appendChild(el('span', { class: 'reaction-badge', text: count > 1 ? `${emoji} ${count}` : emoji }));
  }
}

// Render any server-provided reactions object (storage-only this round).
export function renderServerReactions(messageId, reactions) {
  if (!reactions || typeof reactions !== 'object') return;
  const map = localReactions.get(messageId) || {};
  for (const [emoji, who] of Object.entries(reactions)) {
    const n = Array.isArray(who) ? who.length : Number(who) || 0;
    if (n) map[emoji] = Math.max(map[emoji] || 0, n);
  }
  if (Object.keys(map).length) { localReactions.set(messageId, map); renderReactions(messageId); }
}

export function hasReactions(messageId) {
  const m = localReactions.get(messageId);
  return Boolean(m && Object.keys(m).length);
}
