// Combined call log (voice + video) for the single Calls tab. Sub-filter:
// All / Voice / Video / Missed. Missed calls styled red. Tap to call back.

import { api } from './api.js';
import { state, emit, on } from './state.js';
import { $, $$, clear, el, show, hide, fmtDateTime, fmtDuration, toast } from './ui.js';

let nameCache = new Map();
let currentFilter = 'all';

async function nameOf(userId) {
  if (userId === state.userId) return state.displayName;
  if (nameCache.has(userId)) return nameCache.get(userId);
  try {
    const u = await api.getUser(userId);
    nameCache.set(userId, u.displayName);
    return u.displayName;
  } catch { return 'Unknown'; }
}

function statusText(c) {
  if (c.status === 'completed') return `Completed · ${fmtDuration(c.durationSec)}`;
  if (c.status === 'declined') return 'Declined';
  return 'Missed';
}

async function renderCallItem(c) {
  const incoming = c.calleeId === state.userId;
  const otherId = incoming ? c.callerId : c.calleeId;
  const otherName = await nameOf(otherId);
  // missed = received-but-not-answered; dialed = outgoing; received = answered incoming
  let dirText, arrow, dirClass;
  if (c.status === 'missed') { dirText = 'Missed'; arrow = '⤬'; dirClass = 'call-item--missed'; }
  else if (incoming) { dirText = 'Received'; arrow = '↙'; dirClass = 'call-item--received'; }
  else { dirText = 'Dialed'; arrow = '↗'; dirClass = 'call-item--dialed'; }

  const typeIcon = c.type === 'video' ? '🎥' : '📞';

  return el('li', {}, [
    el('button', {
      class: `call-item ${dirClass}`,
      type: 'button',
      'aria-label': `${dirText} ${c.type} call with ${otherName}, ${statusText(c)}. Tap to call back.`,
      onclick: () => emit('call:start', { peer: { id: otherId, displayName: otherName }, callType: c.type }),
    }, [
      el('span', { class: 'call-item__top' }, [
        el('span', { class: 'call-item__name', text: `${typeIcon} ${otherName}` }),
        el('span', { class: `call-item__meta ${c.status === 'missed' ? 'call-item__meta--missed' : ''}`, text: `${arrow} ${dirText}` }),
      ]),
      el('span', { class: 'call-item__meta', text: `${statusText(c)} · ${fmtDateTime(c.startedAt)}` }),
    ]),
  ]);
}

function applyFilter(calls) {
  if (currentFilter === 'voice') return calls.filter((c) => c.type === 'voice');
  if (currentFilter === 'video') return calls.filter((c) => c.type === 'video');
  if (currentFilter === 'missed') return calls.filter((c) => c.status === 'missed');
  return calls;
}

export async function loadCalls() {
  const listEl = $('#call-log');
  const emptyEl = $('#call-empty');
  try {
    const all = await api.listCalls(state.userId);
    const calls = applyFilter(all);
    clear(listEl);
    if (!calls.length) { show(emptyEl); return; }
    hide(emptyEl);
    for (const c of calls) listEl.appendChild(await renderCallItem(c));
  } catch (e) {
    toast('Could not load call history.');
  }
}

function renderFilters() {
  for (const b of $$('.call-filter')) {
    const active = b.dataset.filter === currentFilter;
    b.setAttribute('aria-selected', String(active));
    b.classList.toggle('call-filter--active', active);
  }
}

export function initCallLog() {
  $('#new-call-btn').addEventListener('click', () => emit('peerpicker:open', { intent: 'voice' }));

  for (const b of $$('.call-filter')) {
    b.addEventListener('click', () => { currentFilter = b.dataset.filter; renderFilters(); loadCalls(); });
  }
  renderFilters();

  on('calls:changed', () => { if (!$('#view-calls').hidden) loadCalls(); });
}
