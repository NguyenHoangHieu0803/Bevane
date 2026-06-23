// Messaging feature: conversation list, thread, real-time send/receive,
// typing indicator, presence, read receipts, smart replies, AI note trigger.

import { api } from './api.js';
import { state, emit, on } from './state.js';
import { send as wsSend } from './ws.js';
import {
  $, clear, el, show, hide, announce, toast, comingSoon,
  fmtTime, uuid, isTwoPane,
} from './ui.js';
import { openMessageActions, renderServerReactions } from './reactions.js';
import { buildTonePicker, translateText, summarizeChat, showAiResult } from './ai-tools.js';

let messageNodes = new Map(); // messageId -> li node
let tempNodes = new Map();     // clientTempId -> li node
let typingTimeout = null;
let typingSentAt = 0;
let replyContext = null; // { id, body } local-only reply quote
const deletedLocally = new Set(); // messageIds removed for me

// ----------------------------------------------------------------- list
export async function loadConversations() {
  const listEl = $('#conversation-list');
  const emptyEl = $('#conversation-empty');
  try {
    const convs = await api.listConversations(state.userId);
    clear(listEl);
    if (!convs.length) { show(emptyEl); } else { hide(emptyEl); }
    for (const c of convs) listEl.appendChild(renderConversationItem(c));
    emit('groups:changed', {});
  } catch (e) {
    toast('Could not load conversations.');
  }
}

function renderConversationItem(c) {
  const online = c.peer.online;
  const presence = el('span', {
    class: `presence ${online ? 'presence--online' : 'presence--offline'}`,
  }, [
    el('span', { class: 'presence__dot', 'aria-hidden': 'true', text: online ? '●' : '○' }),
    online ? 'Online' : 'Offline',
  ]);

  const preview = c.lastMessage
    ? `${c.lastMessage.senderId === state.userId ? 'You: ' : ''}${c.lastMessage.body}`
    : 'No messages yet';

  return el('li', {}, [
    el('button', {
      class: `conversation-item${c.id === state.activeConversationId ? ' conversation-item--active' : ''}`,
      type: 'button',
      'data-cid': c.id,
      'aria-label': `Open conversation with ${c.peer.displayName}, ${online ? 'online' : 'offline'}`,
      onclick: () => openThread(c.id, c.peer),
    }, [
      el('span', { class: 'conversation-item__top' }, [
        el('span', { class: 'conversation-item__name', text: c.peer.displayName }),
        presence,
      ]),
      el('span', { class: 'conversation-item__preview', text: preview }),
    ]),
  ]);
}

// ----------------------------------------------------------------- thread
export async function openThread(conversationId, peer) {
  state.activeConversationId = conversationId;
  state.activePeer = peer;
  messageNodes = new Map();
  tempNodes = new Map();

  $('#thread-peer-name').textContent = peer.displayName;
  updatePresenceLabel(peer.online);

  show($('#thread-pane'));
  // Two-pane (desktop/tablet): keep the conversation list visible alongside the
  // thread. Single-column (mobile): hide the list so the thread is full-screen.
  $('#view-chats').classList.add('has-thread');
  markActiveConversation(conversationId);
  if (!isTwoPane()) hide($('#chat-list-pane'));
  hide($('#smart-reply-bar'));
  clearReply();
  $('#message-search').hidden = true;
  emit('thread:open', { conversationId, peer });

  const listEl = $('#message-list');
  clear(listEl);
  applyWallpaper(listEl, peer?.wallpaperUrl || null);
  try {
    const messages = await api.listMessages(conversationId, { limit: 50 });
    for (const m of messages) appendMessage(m);
    scrollMessages();
    // Mark incoming as read now that the thread is visible.
    wsSend({ type: 'chat:read', conversationId, userId: state.userId });
  } catch (e) {
    toast('Could not load messages.');
  }
  $('#message-input').focus();
}

export function closeThread() {
  state.activeConversationId = null;
  state.activePeer = null;
  hide($('#thread-pane'));
  show($('#chat-list-pane'));
  $('#view-chats').classList.remove('has-thread');
  markActiveConversation(null);
  loadConversations();
}

// Highlight the open conversation in the list (visible in two-pane mode).
function markActiveConversation(conversationId) {
  for (const btn of $('#conversation-list').querySelectorAll('.conversation-item')) {
    btn.classList.toggle('conversation-item--active', btn.dataset.cid === conversationId);
  }
}

function updatePresenceLabel(online) {
  const elp = $('#thread-peer-presence');
  elp.className = `presence ${online ? 'presence--online' : 'presence--offline'}`;
  elp.textContent = '';
  elp.appendChild(el('span', { class: 'presence__dot', 'aria-hidden': 'true', text: online ? '●' : '○' }));
  elp.appendChild(document.createTextNode(online ? 'Online' : 'Offline'));
}

// ----------------------------------------------------------------- messages
function statusLabel(status) {
  if (status === 'read') return 'Read';
  if (status === 'delivered') return 'Delivered';
  return 'Sent';
}

function appendMessage(m, clientTempId) {
  if (deletedLocally.has(m.id)) return null;
  const mine = m.senderId === state.userId;
  const meta = el('span', { class: 'message__meta' }, [fmtTime(m.createdAt)]);
  if (mine) {
    meta.appendChild(document.createTextNode(' · '));
    const st = el('span', { class: 'message__status', text: statusLabel(m.status) });
    meta.appendChild(st);
  }

  const children = [];
  // Reply quote (client-only this round; replyTo round-trips as null on server)
  if (m.replyTo && typeof m.replyTo === 'object' && m.replyTo.body) {
    children.push(el('span', { class: 'message__quote', text: `↩︎ ${m.replyTo.body}` }));
  }
  children.push(el('span', { class: 'message__body', text: m.deleted ? 'Message deleted' : m.body }));
  children.push(meta);

  // Per-message action button (react / reply / delete). Real handler -> no dead button.
  const actionBtn = el('button', {
    class: 'message__menu-btn', type: 'button',
    'aria-label': 'Message actions: react, reply, delete',
    onclick: (ev) => { ev.stopPropagation(); openMessageActions(m.id, m.body); },
  }, ['⋯']);
  children.push(actionBtn);

  const li = el('li', {
    class: `message ${mine ? 'message--me' : 'message--them'}`,
    'data-id': m.id,
    'data-body': m.body || '',
  }, children);

  if (clientTempId && tempNodes.has(clientTempId)) {
    // reconcile optimistic bubble
    const old = tempNodes.get(clientTempId);
    old.replaceWith(li);
    tempNodes.delete(clientTempId);
  } else {
    $('#message-list').appendChild(li);
  }
  messageNodes.set(m.id, li);
  if (m.reactions) renderServerReactions(m.id, m.reactions);
  return li;
}

function updateMessageStatus(messageId, status) {
  const li = messageNodes.get(messageId);
  if (!li) return;
  const st = li.querySelector('.message__status');
  if (st) st.textContent = statusLabel(status);
}

function scrollMessages() {
  const listEl = $('#message-list');
  listEl.scrollTop = listEl.scrollHeight;
}

function sendMessage(body) {
  const text = body.trim();
  if (!text) return false; // AC-M7 reject empty/whitespace
  if (!state.activeConversationId) return false;
  const clientTempId = uuid();

  // optimistic bubble (status: sent)
  const optimistic = {
    id: `temp-${clientTempId}`,
    senderId: state.userId,
    body: text,
    status: 'sent',
    createdAt: Date.now(),
    replyTo: replyContext ? { body: replyContext.body } : null,
  };
  const node = appendMessage(optimistic);
  tempNodes.set(clientTempId, node);
  scrollMessages();
  clearReply();

  wsSend({
    type: 'chat:send',
    conversationId: state.activeConversationId,
    senderId: state.userId,
    body: text,
    clientTempId,
  });
  hide($('#smart-reply-bar'));
  return true;
}

// ----------------------------------------------------------------- reply quote (local)
function setReply({ id, body }) {
  replyContext = { id, body };
  const bar = $('#reply-bar');
  $('#reply-bar-text').textContent = body;
  show(bar);
  $('#message-input').focus();
  announce('Replying to a message.');
}
function clearReply() {
  replyContext = null;
  hide($('#reply-bar'));
}

// ----------------------------------------------------------------- delete (local)
function deleteMessageLocal(id) {
  deletedLocally.add(id);
  const li = messageNodes.get(id);
  if (li) li.remove();
  messageNodes.delete(id);
  toast('Message deleted on this device.');
  announce('Message deleted for you. Unsend for everyone is coming soon.');
}

// ----------------------------------------------------------------- message search (client-side)
function filterMessages(query) {
  const q = query.trim().toLowerCase();
  let shown = 0;
  for (const li of $('#message-list').querySelectorAll('.message')) {
    const body = (li.getAttribute('data-body') || '').toLowerCase();
    const match = !q || body.includes(q);
    li.hidden = !match;
    if (match) shown++;
  }
  if (q) announce(`${shown} message${shown === 1 ? '' : 's'} match.`);
}

// ----------------------------------------------------------------- typing
function sendTyping(isTyping) {
  if (!state.activeConversationId) return;
  wsSend({
    type: 'typing',
    conversationId: state.activeConversationId,
    userId: state.userId,
    isTyping,
  });
}

// ----------------------------------------------------------------- AI helpers
async function requestSmartReplies() {
  if (!state.activeConversationId) return;
  const bar = $('#smart-reply-bar');
  clear(bar);
  show(bar);
  bar.appendChild(el('span', { text: 'Thinking…', style: 'color:var(--text-muted)' }));
  try {
    const { suggestions } = await api.smartReply(state.activeConversationId, state.userId);
    clear(bar);
    if (!suggestions || !suggestions.length) {
      bar.appendChild(el('span', { text: 'No suggestions yet.', style: 'color:var(--text-muted)' }));
      return;
    }
    for (const s of suggestions) {
      bar.appendChild(el('button', {
        class: 'smart-reply-chip',
        type: 'button',
        'aria-label': `Insert suggested reply: ${s}`,
        onclick: () => {
          $('#message-input').value = s;
          $('#message-input').focus();
          hide(bar);
        },
      }, [`✨ ${s}`]));
    }
  } catch (e) {
    clear(bar);
    bar.appendChild(el('span', { text: 'Could not get suggestions.', style: 'color:var(--text-muted)' }));
  }
}

async function generateNoteFromConversation() {
  if (!state.activeConversationId) return;
  try {
    const note = await api.generateNote(state.userId, state.activeConversationId);
    toast('AI note created. See the Notes tab.');
    announce('AI note generated and saved.');
    emit('notes:changed', note);
  } catch (e) {
    toast(e.message || 'Could not generate note.');
  }
}

// ----------------------------------------------------------------- notifications
function notifyMessage(body, senderName, conversationId) {
  if (!('Notification' in window) || Notification.permission !== 'granted') return;
  if (!document.hidden) return; // app is visible — no popup needed
  const n = new Notification(senderName || 'Bevane', {
    body,
    icon: '/icons/icon.svg',
    tag: `msg-${conversationId}`, // collapses repeated notifications for same chat
  });
  n.onclick = () => { window.focus(); n.close(); };
}

// ----------------------------------------------------------------- wiring
function applyWallpaper(listEl, url) {
  if (!listEl) return;
  listEl.style.backgroundImage = url ? `url(${JSON.stringify(url)})` : '';
  listEl.classList.toggle('has-wallpaper', Boolean(url));
}

export function initChats() {
  // Wallpaper changes (from profile)
  // Wallpaper broadcast from server: update background if the active peer changed it.
  on('wallpaper_changed', ({ userId, wallpaperUrl }) => {
    if (state.activePeer && state.activePeer.id === userId) {
      applyWallpaper($('#message-list'), wallpaperUrl || null);
      state.activePeer = { ...state.activePeer, wallpaperUrl: wallpaperUrl || null };
    }
  });

  // New conversation -> open peer picker
  $('#new-chat-btn').addEventListener('click', () => emit('peerpicker:open', { intent: 'chat' }));

  // Composer
  const form = $('#message-form');
  const input = $('#message-input');
  form.addEventListener('submit', (e) => {
    e.preventDefault();
    if (sendMessage(input.value)) {
      input.value = '';
      sendTyping(false);
    }
  });

  input.addEventListener('input', () => {
    const now = Date.now();
    if (now - typingSentAt > 1500) { sendTyping(true); typingSentAt = now; }
    clearTimeout(typingTimeout);
    typingTimeout = setTimeout(() => { sendTyping(false); typingSentAt = 0; }, 2500);
  });

  $('#smart-reply-btn').addEventListener('click', requestSmartReplies);
  $('#thread-gennote-btn').addEventListener('click', generateNoteFromConversation);

  $('#thread-voice-btn').addEventListener('click', () => {
    if (state.activePeer) emit('call:start', { peer: state.activePeer, callType: 'voice' });
  });
  $('#thread-video-btn').addEventListener('click', () => {
    if (state.activePeer) emit('call:start', { peer: state.activePeer, callType: 'video' });
  });

  // Chat summary (WORKING — /api/ai/chat-summary)
  $('#thread-summary-btn').addEventListener('click', () => {
    if (state.activeConversationId) summarizeChat(state.activeConversationId);
  });

  // Message search toggle (WORKING — client-side filter over loaded messages)
  $('#thread-search-btn').addEventListener('click', () => {
    const box = $('#message-search');
    const showing = box.hidden;
    box.hidden = !showing;
    if (showing) { $('#message-search-input').value = ''; $('#message-search-input').focus(); }
    else filterMessages('');
  });
  $('#message-search-input').addEventListener('input', (e) => filterMessages(e.target.value));

  // Tone adjuster popover (WORKING — /api/ai/tone-adjust)
  const tonePicker = buildTonePicker(
    () => input.value,
    (v) => { input.value = v; input.focus(); }
  );
  $('#message-form').insertBefore(tonePicker, $('#message-form').firstChild);
  $('#tone-btn').addEventListener('click', () => {
    tonePicker.hidden = !tonePicker.hidden;
    if (!tonePicker.hidden) tonePicker.querySelector('button')?.focus();
  });

  // Attach menu (all media = stubs via comingSoon)
  $('#attach-btn').addEventListener('click', () => emit('attach:open', {}));
  $('#attach-sheet-close')?.addEventListener('click', () => hide($('#attach-sheet')));
  for (const b of document.querySelectorAll('[data-attach]')) {
    b.addEventListener('click', () => { comingSoon(`Send ${b.dataset.attach}`); hide($('#attach-sheet')); });
  }
  on('attach:open', () => { show($('#attach-sheet')); $('#attach-sheet-close')?.focus(); });
  $('#attach-sheet')?.addEventListener('keydown', (e) => { if (e.key === 'Escape') hide($('#attach-sheet')); });

  // Reply / delete / translate from the message action sheet
  on('msg:reply', setReply);
  on('msg:delete', ({ id }) => deleteMessageLocal(id));
  on('msg:translate', async ({ body }) => {
    const lang = (prompt('Translate to which language code? (es, fr, vi, de…)', 'es') || '').trim();
    if (!lang) return;
    try {
      const { result, targetLang } = await translateText(body, lang);
      showAiResult({ title: `Translation → ${targetLang}`, body: result });
    } catch (e) {
      toast(e.message || 'Could not translate.');
    }
  });
  $('#reply-bar-cancel').addEventListener('click', clearReply);

  // Spam detection stub
  $('#spam-btn')?.addEventListener('click', () => comingSoon('Spam detection'));

  // ---- WS events ----
  on('chat:new', ({ message, clientTempId }) => {
    if (message.conversationId !== state.activeConversationId) {
      // not in this thread — refresh the list preview + announce
      loadConversations();
      if (message.senderId !== state.userId) {
        announce('New message received.');
        notifyMessage(message.body, state.presence.get ? 'Bevane' : 'Bevane', message.conversationId);
      }
      return;
    }
    if (clientTempId) {
      appendMessage(message, clientTempId); // reconcile mine
    } else {
      appendMessage(message);
      if (message.senderId !== state.userId) {
        const peerName = state.activePeer ? state.activePeer.displayName : 'peer';
        announce(`New message from ${peerName}: ${message.body}`);
        // we're viewing it → mark read
        wsSend({ type: 'chat:read', conversationId: state.activeConversationId, userId: state.userId });
        notifyMessage(message.body, peerName, message.conversationId);
      }
    }
    scrollMessages();
  });

  on('chat:status', ({ messageId, status }) => updateMessageStatus(messageId, status));

  on('typing', ({ conversationId, userId, isTyping }) => {
    if (conversationId !== state.activeConversationId) return;
    if (userId === state.userId) return;
    const ti = $('#typing-indicator');
    if (isTyping) {
      ti.textContent = `${state.activePeer ? state.activePeer.displayName : 'Peer'} is typing…`;
      show(ti);
    } else {
      hide(ti); ti.textContent = '';
    }
  });

  on('presence', ({ userId, online }) => {
    state.presence.set(userId, online);
    if (state.activePeer && state.activePeer.id === userId) {
      state.activePeer.online = online;
      updatePresenceLabel(online);
    }
    // refresh list if visible
    if (!$('#chat-list-pane').hidden) loadConversations();
  });

  on('ws:ready', () => {
    if (!$('#view-chats').hidden) loadConversations();
    // After a reconnect, catch up on any messages that arrived while the
    // WebSocket was down (mobile network drops, proxy idle-timeout, etc.).
    if (state.activeConversationId && !$('#thread-pane').hidden) {
      api.listMessages(state.activeConversationId, { limit: 50 })
        .then((messages) => {
          for (const m of messages) {
            if (!messageNodes.has(m.id)) {
              appendMessage(m);
              scrollMessages();
            }
          }
        })
        .catch(() => {});
    }
  });

  // Back button handled by app.js navigation, but expose closeThread.
  on('thread:close', closeThread);
}
