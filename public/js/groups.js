// Group chat: create (WORKING via POST /api/groups) + list. Group *messaging*
// is storage-only on the backend this round, so a created group's thread is a
// labeled stub (sends route to comingSoon).

import { api } from './api.js';
import { state, emit, on } from './state.js';
import { $, clear, el, show, hide, toast, announce, comingSoon, fmtDateTime } from './ui.js';

let lastFocused = null;

// ----------------------------------------------------------------- create dialog
async function openCreate() {
  lastFocused = document.activeElement;
  const dlg = $('#group-dialog');
  const listEl = $('#group-member-list');
  clear(listEl);
  $('#group-name-input').value = '';
  show(dlg);
  $('#group-name-input').focus();
  try {
    const users = await api.listUsers(state.userId);
    if (!users.length) {
      listEl.appendChild(el('p', { class: 'empty-state', text: 'No other users to add yet.' }));
      return;
    }
    for (const u of users) {
      const id = `gm-${u.id}`;
      listEl.appendChild(el('label', { class: 'group-member', for: id }, [
        el('input', { type: 'checkbox', id, value: u.id, class: 'group-member__cb' }),
        el('span', { text: u.displayName }),
      ]));
    }
  } catch (e) {
    listEl.appendChild(el('p', { class: 'empty-state', text: 'Could not load users.' }));
  }
}

function closeCreate() {
  hide($('#group-dialog'));
  if (lastFocused && lastFocused.focus) lastFocused.focus();
}

async function submitCreate(e) {
  e.preventDefault();
  const name = $('#group-name-input').value.trim();
  if (!name) { toast('Enter a group name.'); return; }
  const memberIds = Array.from(document.querySelectorAll('.group-member__cb'))
    .filter((c) => c.checked).map((c) => c.value);
  try {
    const group = await api.createGroup(state.userId, name, memberIds);
    toast(`Group "${group.name}" created.`);
    announce(`Group ${group.name} created with ${group.memberIds.length} members.`);
    closeCreate();
    loadGroups();
  } catch (err) {
    toast(err.message || 'Could not create group.');
  }
}

// ----------------------------------------------------------------- list
export async function loadGroups() {
  const listEl = $('#group-list');
  if (!listEl) return;
  try {
    const groups = await api.listGroups(state.userId);
    clear(listEl);
    if (!groups.length) { hide(listEl); return; }
    show(listEl);
    listEl.appendChild(el('li', { class: 'group-list__head', text: 'Groups' }));
    for (const g of groups) {
      listEl.appendChild(el('li', {}, [
        el('button', {
          class: 'conversation-item', type: 'button',
          'aria-label': `Open group ${g.name}, ${g.memberIds.length} members. Group messaging coming soon.`,
          onclick: () => openGroupThread(g),
        }, [
          el('span', { class: 'conversation-item__top' }, [
            el('span', { class: 'conversation-item__name', text: `👥 ${g.name}` }),
            el('span', { class: 'note-item__badge', text: 'Group' }),
          ]),
          el('span', { class: 'conversation-item__preview', text: `${g.memberIds.length} members · created ${fmtDateTime(g.createdAt)}` }),
        ]),
      ]));
    }
  } catch (e) {
    /* groups optional; silent */
  }
}

// Group thread is a labeled stub: backend has no group send this round.
function openGroupThread(g) {
  comingSoon(`Group chat "${g.name}" messaging`);
}

export function initGroups() {
  $('#new-group-btn').addEventListener('click', openCreate);
  $('#group-form').addEventListener('submit', submitCreate);
  $('#group-cancel').addEventListener('click', closeCreate);
  $('#group-dialog').addEventListener('keydown', (e) => { if (e.key === 'Escape') closeCreate(); });
  on('groups:changed', loadGroups);
}
