// Modal to pick a registered peer. Intent: 'chat' | 'voice' | 'video'.

import { api } from './api.js';
import { state, emit, on } from './state.js';
import { $, clear, el, show, hide, toast } from './ui.js';

let lastFocused = null;
let currentIntent = 'chat';

async function open({ intent }) {
  currentIntent = intent || 'chat';
  lastFocused = document.activeElement;
  const listEl = $('#peer-list');
  const emptyEl = $('#peer-empty');
  clear(listEl);
  hide(emptyEl);
  show($('#peer-picker'));
  $('#peer-picker-close').focus();

  try {
    const users = await api.listUsers(state.userId);
    if (!users.length) { show(emptyEl); return; }
    for (const u of users) listEl.appendChild(renderPeer(u));
    listEl.querySelector('button')?.focus();
  } catch (e) {
    toast('Could not load users.');
  }
}

function renderPeer(u) {
  const online = u.online;
  return el('li', {}, [
    el('button', {
      class: 'peer-item',
      type: 'button',
      'aria-label': `${u.displayName}, ${online ? 'online' : 'offline'}. ${intentVerb()} ${u.displayName}.`,
      onclick: () => select(u),
    }, [
      el('span', { class: 'peer-item__top' }, [
        el('span', { class: 'peer-item__name', text: u.displayName }),
        el('span', {
          class: `presence ${online ? 'presence--online' : 'presence--offline'}`,
        }, [
          el('span', { class: 'presence__dot', 'aria-hidden': 'true', text: online ? '●' : '○' }),
          online ? 'Online' : 'Offline',
        ]),
      ]),
    ]),
  ]);
}

function intentVerb() {
  if (currentIntent === 'voice') return 'Voice call';
  if (currentIntent === 'video') return 'Video call';
  return 'Open chat with';
}

async function select(peer) {
  close();
  if (currentIntent === 'voice' || currentIntent === 'video') {
    emit('call:start', { peer, callType: currentIntent });
    return;
  }
  // chat: open/create conversation then open thread
  try {
    const conv = await api.openConversation(state.userId, peer.id);
    emit('chat:open-conversation', { conversationId: conv.id, peer });
  } catch (e) {
    toast(e.message || 'Could not open conversation.');
  }
}

function close() {
  hide($('#peer-picker'));
  if (lastFocused && lastFocused.focus) lastFocused.focus();
}

export function initPeerPicker() {
  $('#peer-picker-close').addEventListener('click', close);
  $('#peer-picker').addEventListener('keydown', (e) => { if (e.key === 'Escape') close(); });
  on('peerpicker:open', open);
}
