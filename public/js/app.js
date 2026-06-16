// App entry point: splash -> onboarding -> connect WS -> wire features + nav.

import { state, on, emit } from './state.js';
import { connect } from './ws.js';
import { ensureRegistered } from './onboarding.js';
import { $, $$, show, hide, toast } from './ui.js';

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
  for (const tab of $$('.tab')) {
    const sel = tab.dataset.view === view;
    tab.setAttribute('aria-selected', String(sel));
    tab.tabIndex = sel ? 0 : -1;
  }
  $('#view-title').textContent = VIEW_TITLES[view];
  updateBackButton();

  // lazy-load the view's data
  if (view === 'chats') { loadConversations(); loadGroups(); }
  else if (view === 'calls') loadCalls();
  else if (view === 'notes') loadNotes();

  $('#main').focus();
}

// Back button appears for sub-panes (thread, note editor).
function updateBackButton() {
  const inThread = currentView === 'chats' && !$('#thread-pane').hidden;
  const inEditor = currentView === 'notes' && isNoteEditorOpen();
  $('#back-btn').hidden = !(inThread || inEditor);
}

function handleBack() {
  if (currentView === 'chats' && !$('#thread-pane').hidden) {
    closeThread();
  } else if (currentView === 'notes' && isNoteEditorOpen()) {
    emit('notes:close', {});
  }
  updateBackButton();
}

// --------------------------------------------------------------- tab bar a11y
function initTabBar() {
  const tabs = $$('.tab');
  for (const tab of tabs) {
    tab.addEventListener('click', () => showView(tab.dataset.view));
    tab.addEventListener('keydown', (e) => {
      const i = tabs.indexOf(tab);
      let next = null;
      if (e.key === 'ArrowRight') next = tabs[(i + 1) % tabs.length];
      else if (e.key === 'ArrowLeft') next = tabs[(i - 1 + tabs.length) % tabs.length];
      else if (e.key === 'Home') next = tabs[0];
      else if (e.key === 'End') next = tabs[tabs.length - 1];
      if (next) { e.preventDefault(); next.focus(); showView(next.dataset.view); }
    });
  }
  $('#back-btn').addEventListener('click', handleBack);
}

// --------------------------------------------------------------- boot
async function boot() {
  registerServiceWorker();
  await ensureRegistered();

  // identity ready
  $('#self-name').textContent = state.displayName;
  show($('#app'));

  initTabBar();
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

  // Hide splash once the app shell is ready.
  hideSplash();
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
