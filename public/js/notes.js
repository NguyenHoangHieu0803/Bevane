// Notes CRUD + Round-2 fields (folder, pinned, color, reminderAt, locked,
// checklist) all persisted via POST/PUT. Plus AI tools backed by /api/ai/*:
// summarize, smart-tags, action-items, ask-about-note, write-assist.
// Lock enforcement + reminder firing are client-side (best-effort), per handoff.

import { api } from './api.js';
import { state, emit, on } from './state.js';
import { $, $$, clear, el, show, hide, announce, toast, comingSoon, fmtDateTime, isTwoPane } from './ui.js';
import { showAiResult } from './ai-tools.js';

let editing = null;       // current note object or null (new)
let currentFolder = 'All';
let searchQuery = '';
let allNotes = [];
const COLORS = ['', '#ffcc00', '#4f8cff', '#2ea043', '#ff5d5d', '#a06bff'];
let editChecklist = [];   // working copy while editing
let editFields = {};      // pinned/color/folder/reminderAt/locked working copy
const unlocked = new Set(); // note ids unlocked this session

// ----------------------------------------------------------------- list + filters
export async function loadNotes() {
  try {
    allNotes = await api.listNotes(state.userId);
  } catch (e) {
    toast('Could not load notes.');
    allNotes = [];
  }
  renderFolders();
  renderList();
}

function folders() {
  const set = new Set(['All', 'Work', 'Personal']);
  for (const n of allNotes) if (n.folder) set.add(n.folder);
  return Array.from(set);
}

function renderFolders() {
  const bar = $('#notes-folders');
  clear(bar);
  for (const f of folders()) {
    bar.appendChild(el('button', {
      class: `folder-tab${f === currentFolder ? ' folder-tab--active' : ''}`,
      type: 'button', role: 'tab', 'aria-selected': String(f === currentFolder),
      'aria-label': `Show ${f} notes`,
      onclick: () => { currentFolder = f; renderFolders(); renderList(); },
    }, [f]));
  }
  bar.appendChild(el('button', {
    class: 'folder-tab', type: 'button', 'aria-label': 'Create a new folder',
    onclick: () => {
      const name = (prompt('New folder name?') || '').trim();
      if (name) { currentFolder = name; renderFolders(); renderList(); }
    },
  }, ['＋ New']));
}

function visibleNotes() {
  let list = allNotes.slice();
  if (currentFolder !== 'All') list = list.filter((n) => (n.folder || '') === currentFolder);
  if (searchQuery) {
    const q = searchQuery.toLowerCase();
    list = list.filter((n) => `${n.title || ''} ${n.body || ''}`.toLowerCase().includes(q));
  }
  // pinned-first, then updatedAt desc (mirror server ordering for filtered subset)
  list.sort((a, b) => (b.pinned || 0) - (a.pinned || 0) || (b.updatedAt || 0) - (a.updatedAt || 0));
  return list;
}

function renderList() {
  const listEl = $('#notes-list');
  const emptyEl = $('#notes-empty');
  clear(listEl);
  const list = visibleNotes();
  if (!list.length) { show(emptyEl); return; }
  hide(emptyEl);
  for (const n of list) listEl.appendChild(renderNoteItem(n));
}

function renderNoteItem(n) {
  const children = [];
  const top = el('span', { class: 'conversation-item__top' }, [
    el('span', { class: 'note-item__title', text: `${n.pinned ? '📌 ' : ''}${n.locked ? '🔒 ' : ''}${n.title || '(untitled)'}` }),
  ]);
  if (n.source === 'ai') top.appendChild(el('span', { class: 'note-item__badge', text: '✦ AI' }));
  children.push(top);
  const preview = n.locked && !unlocked.has(n.id) ? 'Locked note' : (n.body || 'No content');
  children.push(el('span', { class: 'note-item__preview', text: preview }));
  const metaBits = [`Updated ${fmtDateTime(n.updatedAt)}`];
  if (n.folder) metaBits.push(`· ${n.folder}`);
  if (n.reminderAt) metaBits.push(`· ⏰ ${fmtDateTime(n.reminderAt)}`);
  children.push(el('span', { class: 'call-item__meta', text: metaBits.join(' ') }));

  const btn = el('button', {
    class: 'note-item', type: 'button',
    'aria-label': `Open note: ${n.title || 'untitled'}${n.pinned ? ', pinned' : ''}${n.locked ? ', locked' : ''}`,
    onclick: () => openEditor(n),
  }, children);
  if (n.color) btn.style.borderLeft = `6px solid ${n.color}`;
  return el('li', {}, [btn]);
}

// ----------------------------------------------------------------- editor
function openEditor(note) {
  // Lock gate (client-side enforcement)
  if (note && note.locked && !unlocked.has(note.id)) {
    const pin = prompt('This note is locked. Enter PIN to open (demo: 0000):');
    if (pin !== '0000') { toast('Incorrect PIN.'); return; }
    unlocked.add(note.id);
  }

  editing = note || null;
  editFields = {
    pinned: note ? (note.pinned ? 1 : 0) : 0,
    color: note ? (note.color || '') : '',
    folder: note ? (note.folder || (currentFolder !== 'All' ? currentFolder : '')) : (currentFolder !== 'All' ? currentFolder : ''),
    reminderAt: note ? (note.reminderAt || null) : null,
    locked: note ? (note.locked ? 1 : 0) : 0,
  };
  editChecklist = note && Array.isArray(note.checklist) ? note.checklist.map((i) => ({ ...i })) : [];

  $('#note-title').value = note ? (note.title || '') : '';
  $('#note-body').value = note ? (note.body || '') : '';
  const badge = $('#note-ai-badge');
  if (note && note.source === 'ai') show(badge); else hide(badge);
  $('#note-delete-btn').hidden = !note;

  renderEditorMeta();
  renderChecklist();

  show($('#note-editor-pane'));
  // Two-pane (desktop): keep the notes list visible beside the editor.
  // Single-column (mobile): hide the list so the editor is full-screen.
  $('#view-notes').classList.add('has-editor');
  if (!isTwoPane()) hide($('#notes-list-pane'));
  emit('notes:editor-open', {});
  $('#note-title').focus();
}

function renderEditorMeta() {
  // pin toggle
  const pinBtn = $('#note-pin-btn');
  pinBtn.setAttribute('aria-pressed', String(!!editFields.pinned));
  pinBtn.textContent = editFields.pinned ? '📌 Pinned' : '📌 Pin';

  // lock toggle
  const lockBtn = $('#note-lock-btn');
  lockBtn.setAttribute('aria-pressed', String(!!editFields.locked));
  lockBtn.textContent = editFields.locked ? '🔒 Locked' : '🔓 Lock';

  // folder label
  $('#note-folder-label').textContent = editFields.folder ? `Folder: ${editFields.folder}` : 'No folder';

  // reminder label
  $('#note-reminder-label').textContent = editFields.reminderAt
    ? `⏰ ${fmtDateTime(editFields.reminderAt)}` : 'No reminder';

  // colors
  const row = $('#note-color-row');
  clear(row);
  for (const c of COLORS) {
    const sel = (editFields.color || '') === c;
    const swatch = el('button', {
      class: `color-swatch${sel ? ' color-swatch--sel' : ''}`, type: 'button',
      'aria-label': c ? `Set color ${c}` : 'No color', 'aria-pressed': String(sel),
      onclick: () => { editFields.color = c; renderEditorMeta(); },
    }, [c ? '' : '✕']);
    swatch.style.background = c || 'transparent';
    row.appendChild(swatch);
  }
}

// ----------------------------------------------------------------- checklist
function renderChecklist() {
  const wrap = $('#note-checklist');
  clear(wrap);
  editChecklist.forEach((item, i) => {
    const id = `cl-${i}`;
    wrap.appendChild(el('div', { class: 'checklist-item' }, [
      el('input', {
        type: 'checkbox', id, checked: item.done ? true : false,
        onchange: (e) => { editChecklist[i].done = e.target.checked; },
      }),
      el('label', { for: id, class: item.done ? 'checklist-done' : '', text: item.text }),
      el('button', {
        type: 'button', class: 'checklist-del', 'aria-label': `Remove "${item.text}"`,
        onclick: () => { editChecklist.splice(i, 1); renderChecklist(); },
      }, ['✕']),
    ]));
  });
}

// ----------------------------------------------------------------- save / delete
function collectPatch() {
  return {
    title: $('#note-title').value.trim() || '(untitled)',
    body: $('#note-body').value.trim(),
    folder: editFields.folder || null,
    pinned: editFields.pinned ? 1 : 0,
    color: editFields.color || null,
    reminderAt: editFields.reminderAt || null,
    locked: editFields.locked ? 1 : 0,
    checklist: editChecklist.length ? editChecklist : null,
  };
}

async function saveNote(e) {
  e.preventDefault();
  const patch = collectPatch();
  if (patch.title === '(untitled)' && !patch.body && !editChecklist.length) {
    toast('Add a title, body, or checklist first.');
    return;
  }
  try {
    if (editing) {
      await api.updateNote(editing.id, patch);
      announce('Note saved.');
    } else {
      const { title, body, ...rest } = patch;
      await api.createNote(state.userId, { title, body, ...rest });
      announce('Note created.');
    }
    closeEditor();
  } catch (err) {
    toast(err.message || 'Could not save note.');
  }
}

function closeEditor() {
  editing = null;
  hide($('#note-editor-pane'));
  show($('#notes-list-pane'));
  $('#view-notes').classList.remove('has-editor');
  emit('notes:editor-close', {});
  loadNotes();
}

async function deleteNote() {
  if (!editing) return;
  try {
    await api.deleteNote(editing.id);
    announce('Note deleted.');
    closeEditor();
  } catch (err) {
    toast('Could not delete note.');
  }
}

// ----------------------------------------------------------------- AI tools
function noteText() {
  return `${$('#note-title').value}\n${$('#note-body').value}`.trim();
}

async function aiSummarize() {
  const text = noteText();
  if (!text) { toast('Write something first.'); return; }
  try {
    const { summary, bullets } = await api.noteSummarize({ text });
    showAiResult({ title: 'Note summary', body: summary, bullets });
  } catch (e) { toast(e.message || 'Could not summarize.'); }
}

async function aiSmartTags() {
  const text = noteText();
  if (!text) { toast('Write something first.'); return; }
  try {
    const { tags } = await api.smartTags(text);
    showAiResult({
      title: 'Smart tags', body: tags.map((t) => `#${t}`).join('  '),
      onUse: () => {
        const body = $('#note-body');
        body.value = `${body.value}\n\nTags: ${tags.map((t) => `#${t}`).join(' ')}`.trim();
      },
      useLabel: 'Append tags to note',
    });
  } catch (e) { toast(e.message || 'Could not get tags.'); }
}

async function aiActionItems() {
  const text = noteText();
  if (!text) { toast('Write something first.'); return; }
  try {
    const { actionItems } = await api.actionItems(text);
    if (!actionItems.length) { showAiResult({ title: 'Action items', body: 'No action items found.' }); return; }
    showAiResult({
      title: 'Action items', bullets: actionItems,
      onUse: () => { for (const a of actionItems) editChecklist.push({ text: a, done: false }); renderChecklist(); },
      useLabel: 'Add to checklist',
    });
  } catch (e) { toast(e.message || 'Could not extract action items.'); }
}

async function aiAsk() {
  const text = noteText();
  if (!text) { toast('Write something first.'); return; }
  const q = (prompt('Ask AI about this note:') || '').trim();
  if (!q) return;
  try {
    const { answer } = await api.askAboutNote(text, q);
    showAiResult({ title: `Q: ${q}`, body: answer });
  } catch (e) { toast(e.message || 'Could not answer.'); }
}

async function aiWriteAssist() {
  const prompt_ = (prompt('What should the assistant write? (a short brief)') || '').trim();
  if (!prompt_) return;
  // Reuse smart-tags/summarize style: use note-summarize on the prompt to expand.
  try {
    const { summary, bullets } = await api.noteSummarize({ text: prompt_ });
    const draft = [summary, ...(bullets || []).map((b) => `• ${b}`)].join('\n');
    showAiResult({
      title: 'Write assistant (demo)', body: draft,
      onUse: () => {
        const body = $('#note-body');
        body.value = `${body.value}\n${draft}`.trim();
      },
      useLabel: 'Insert into note',
    });
  } catch (e) { toast(e.message || 'Could not generate text.'); }
}

// ----------------------------------------------------------------- reminders (best-effort)
let reminderTimer = null;
function scheduleReminderCheck() {
  if (reminderTimer) return;
  reminderTimer = setInterval(() => {
    const now = Date.now();
    for (const n of allNotes) {
      if (n.reminderAt && n.reminderAt <= now && n.reminderAt > now - 60000) {
        toast(`⏰ Reminder: ${n.title || 'note'}`);
        announce(`Reminder for note ${n.title || ''}`);
      }
    }
  }, 30000);
}

// ----------------------------------------------------------------- wiring
export function initNotes() {
  $('#new-note-btn').addEventListener('click', () => openEditor(null));
  $('#note-form').addEventListener('submit', saveNote);
  $('#note-delete-btn').addEventListener('click', deleteNote);
  $('#note-cancel-btn').addEventListener('click', closeEditor);

  // search
  $('#notes-search-input').addEventListener('input', (e) => { searchQuery = e.target.value; renderList(); });

  // meta controls
  $('#note-pin-btn').addEventListener('click', () => { editFields.pinned = editFields.pinned ? 0 : 1; renderEditorMeta(); });
  $('#note-lock-btn').addEventListener('click', () => {
    if (!editFields.locked) {
      if (!confirm('Lock this note? Demo PIN is 0000.')) return;
    }
    editFields.locked = editFields.locked ? 0 : 1;
    if (editing) unlocked.add(editing.id);
    renderEditorMeta();
  });
  $('#note-folder-btn').addEventListener('click', () => {
    const f = (prompt('Folder name (blank = none):', editFields.folder || '') || '').trim();
    editFields.folder = f; renderEditorMeta();
  });
  $('#note-reminder-btn').addEventListener('click', () => {
    const cur = editFields.reminderAt ? new Date(editFields.reminderAt).toISOString().slice(0, 16) : '';
    const v = (prompt('Reminder date/time (YYYY-MM-DDTHH:MM), blank to clear:', cur) || '').trim();
    if (!v) { editFields.reminderAt = null; renderEditorMeta(); return; }
    const ts = Date.parse(v);
    if (Number.isNaN(ts)) { toast('Invalid date/time.'); return; }
    editFields.reminderAt = ts; renderEditorMeta();
    toast('Reminder set (best-effort).');
  });

  // checklist add
  $('#note-checklist-add').addEventListener('click', () => {
    const t = (prompt('Checklist item:') || '').trim();
    if (t) { editChecklist.push({ text: t, done: false }); renderChecklist(); }
  });

  // AI tools (WORKING)
  $('#note-ai-summarize').addEventListener('click', aiSummarize);
  $('#note-ai-tags').addEventListener('click', aiSmartTags);
  $('#note-ai-actions').addEventListener('click', aiActionItems);
  $('#note-ai-ask').addEventListener('click', aiAsk);
  $('#note-ai-write').addEventListener('click', aiWriteAssist);

  // stubs
  $('#note-grammar-btn').addEventListener('click', () => comingSoon('Grammar check'));
  $('#note-richtext-btn').addEventListener('click', () => comingSoon('Rich text formatting'));
  $('#note-image-btn').addEventListener('click', () => comingSoon('Attach image'));
  $('#note-voice-btn').addEventListener('click', () => comingSoon('Voice to note'));
  $('#note-export-btn').addEventListener('click', () => comingSoon('Export / share PDF'));

  on('notes:changed', () => { if (!$('#view-notes').hidden) loadNotes(); });
  on('notes:close', closeEditor);

  scheduleReminderCheck();
}

export function isNoteEditorOpen() {
  return !$('#note-editor-pane').hidden;
}
