// App entry point: splash -> onboarding -> connect WS -> wire features + nav.

import { state, on, emit } from './state.js';
import { connect } from './ws.js';
import { ensureRegistered } from './onboarding.js';
import { $, $$, show, hide, toast, isTwoPane, onTwoPaneChange } from './ui.js';

import { initChats, loadConversations, openThread, closeThread } from './chats.js';
import { initCalls } from './webrtc.js';
import { initCallLog, loadCalls } from './calllog.js';
import { initNotes, loadNotes, isNoteEditorOpen } from './notes.js';
import { initPeerPicker } from './peerpicker.js';
import { initProfile } from './profile.js';
import { initGroups, loadGroups } from './groups.js';

const VIEW_TITLES = { chats: 'Chats', calls: 'Calls', notes: 'Notes', profile: 'Profile' };
let currentView = 'chats';

// --------------------------------------------------------------- navigation
function showView(view) {
  currentView = view;
  for (const name of Object.keys(VIEW_TITLES)) {
    const v = $(`#view-${name}`);
    if (v) v.hidden = name !== view;
  }
  // Keep the bottom tab bar (mobile) and the sidebar nav (desktop) in sync —
  // they are the same logical nav, shown one per breakpoint by CSS.
  for (const nav of $$('.tab, .sidenav')) {
    const sel = nav.dataset.view === view;
    nav.setAttribute('aria-selected', String(sel));
    nav.tabIndex = sel ? 0 : -1;
  }
  $('#view-title').textContent = VIEW_TITLES[view];
  updateBackButton();

  // lazy-load the view's data
  if (view === 'chats') { loadConversations(); loadGroups(); }
  else if (view === 'calls') loadCalls();
  else if (view === 'notes') loadNotes();

  $('#main').focus();
}

// Back button appears for sub-panes (thread, note editor) in single-column
// (mobile) mode only. In two-pane mode both panes are visible, so there is
// nothing to go "back" from — the back button stays hidden.
function updateBackButton() {
  const inThread = currentView === 'chats' && !$('#thread-pane').hidden;
  const inEditor = currentView === 'notes' && isNoteEditorOpen();
  $('#back-btn').hidden = isTwoPane() || !(inThread || inEditor);
}

function handleBack() {
  if (currentView === 'chats' && !$('#thread-pane').hidden) {
    closeThread();
  } else if (currentView === 'notes' && isNoteEditorOpen()) {
    emit('notes:close', {});
  }
  updateBackButton();
}

// --------------------------------------------------------------- nav a11y
// Wire one nav group (the bottom tab bar OR the sidebar) for click + roving
// arrow-key navigation. `nextKey`/`prevKey` differ by orientation: the bottom
// tab bar is horizontal (Left/Right), the sidebar is vertical (Up/Down).
function wireNavGroup(items, nextKey, prevKey) {
  for (const item of items) {
    item.addEventListener('click', () => showView(item.dataset.view));
    item.addEventListener('keydown', (e) => {
      const i = items.indexOf(item);
      let next = null;
      if (e.key === nextKey) next = items[(i + 1) % items.length];
      else if (e.key === prevKey) next = items[(i - 1 + items.length) % items.length];
      else if (e.key === 'Home') next = items[0];
      else if (e.key === 'End') next = items[items.length - 1];
      if (next) { e.preventDefault(); next.focus(); showView(next.dataset.view); }
    });
  }
}

function initNav() {
  wireNavGroup($$('.tab'), 'ArrowRight', 'ArrowLeft');
  wireNavGroup($$('.sidenav'), 'ArrowDown', 'ArrowUp');
  // Sidebar "me" shortcut -> Profile.
  $('#side-me')?.addEventListener('click', () => showView('profile'));
  $('#back-btn').addEventListener('click', handleBack);

  // Resize / breakpoint crossing: when entering two-pane while a thread or note
  // editor is open, the list pane may have been hidden by the mobile single-
  // column logic. Re-reveal it so both panes show. Going the other way, CSS
  // handles it (the detail pane covers the column).
  onTwoPaneChange((mq) => {
    if (mq.matches) {
      if (!$('#view-chats').hidden && $('#view-chats').classList.contains('has-thread')) {
        show($('#chat-list-pane'));
      }
      if (!$('#view-notes').hidden && $('#view-notes').classList.contains('has-editor')) {
        show($('#notes-list-pane'));
      }
    } else {
      // Back to single column: if a detail pane is open, hide its list again.
      if ($('#view-chats').classList.contains('has-thread')) hide($('#chat-list-pane'));
      if ($('#view-notes').classList.contains('has-editor')) hide($('#notes-list-pane'));
    }
    updateBackButton();
  });
}

// --------------------------------------------------------------- boot
async function boot() {
  registerServiceWorker();
  // Hide the splash before showing any interactive UI. The splash z-index (800)
  // is above the onboarding form (500), so without this the splash permanently
  // blocks new users from registering. (BUG-CRITICAL-001)
  hideSplash();
  await ensureRegistered();

  // identity ready
  $('#self-name').textContent = state.displayName;
  const sideName = $('#side-self-name');
  if (sideName) sideName.textContent = state.displayName;
  show($('#app'));

  initNav();
  initChats();
  initCalls();
  initCallLog();
  initNotes();
  initPeerPicker();
  initGroups();
  initProfile();

  // cross-module navigation hooks
  on('chat:open-conversation', ({ conversationId, peer }) => {
    showView('chats');
    openThread(conversationId, peer).then(updateBackButton);
  });
  on('thread:open', updateBackButton);
  on('notes:editor-open', updateBackButton);
  on('notes:editor-close', updateBackButton);

  connect();
  showView('chats');
}

function hideSplash() {
  const splash = $('#splash');
  if (!splash) return;
  splash.hidden = true;
}

function registerServiceWorker() {
  if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
      navigator.serviceWorker.register('/sw.js').catch((e) => {
        console.warn('[bevane] SW registration failed', e);
      });
    });
  }
}

// Surface replaced-session errors.
on('error', (frame) => {
  if (frame.code === 'replaced') {
    toast('Opened in another tab/device. This session is now read-only.');
  }
});

// Safety: never leave the splash stuck if boot throws.
boot().catch((e) => {
  console.error('[bevane] boot failed', e);
  hideSplash();
});
