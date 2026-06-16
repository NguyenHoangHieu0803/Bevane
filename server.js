'use strict';

/**
 * Bevane — single-process server.
 *
 * Serves:
 *   - the REST API under /api
 *   - the WebSocket signaling/chat channel at /ws
 *   - the static PWA frontend from /public (same-origin)
 *
 * No auth: identity is a display name + server-generated UUID. Listens on
 * process.env.PORT || 3000, bound to 0.0.0.0.
 */

const path = require('path');
const http = require('http');
const express = require('express');

const db = require('./src/db');
const ai = require('./src/ai');
const { attachWebSocketServer, isOnline } = require('./src/ws');

const app = express();
app.use(express.json());

const PORT = process.env.PORT || 3000;
const HOST = '0.0.0.0';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function err(res, status, code, message) {
  return res.status(status).json({ error: code, message });
}

/** Decorate a user row with the live online flag. */
function withPresence(user) {
  if (!user) return null;
  return {
    id: user.id,
    displayName: user.displayName,
    online: isOnline(user.id),
    lastSeenAt: user.lastSeenAt,
  };
}

// Wrap async-ish handlers so thrown errors become 500s.
function wrap(fn) {
  return (req, res) => {
    try {
      fn(req, res);
    } catch (e) {
      console.error(e);
      err(res, 500, 'server_error', e.message || 'Internal error');
    }
  };
}

// ---------------------------------------------------------------------------
// Users
// ---------------------------------------------------------------------------
app.post('/api/users', wrap((req, res) => {
  const raw = (req.body && req.body.displayName) || '';
  const displayName = String(raw).trim();
  if (!displayName || displayName.length < 1 || displayName.length > 40) {
    return err(res, 400, 'invalid_display_name', 'displayName must be 1–40 characters.');
  }
  const user = db.createUser(displayName);
  res.status(201).json({ id: user.id, displayName: user.displayName, createdAt: user.createdAt });
}));

app.get('/api/users', wrap((req, res) => {
  const excludeId = req.query.excludeId;
  let users = db.listUsers();
  if (excludeId) users = users.filter((u) => u.id !== excludeId);
  res.json(users.map(withPresence));
}));

app.get('/api/users/:id', wrap((req, res) => {
  const user = db.getUser(req.params.id);
  if (!user) return err(res, 404, 'not_found', 'User not found.');
  res.json(withPresence(user));
}));

// ---------------------------------------------------------------------------
// Conversations & Messages
// ---------------------------------------------------------------------------
app.post('/api/conversations', wrap((req, res) => {
  const { userId, peerId } = req.body || {};
  if (!userId || !peerId) {
    return err(res, 400, 'missing_params', 'userId and peerId are required.');
  }
  if (userId === peerId) {
    return err(res, 400, 'same_user', 'Cannot open a conversation with yourself.');
  }
  if (!db.getUser(userId) || !db.getUser(peerId)) {
    return err(res, 400, 'user_not_found', 'One or both users do not exist.');
  }
  const { conversation, created } = db.getOrCreateConversation(userId, peerId);
  res.status(created ? 201 : 200).json(conversation);
}));

app.get('/api/conversations', wrap((req, res) => {
  const userId = req.query.userId;
  if (!userId) return err(res, 400, 'missing_params', 'userId query param is required.');
  if (!db.getUser(userId)) return err(res, 404, 'not_found', 'User not found.');
  const convs = db.listConversationsForUser(userId).map((c) => ({
    ...c,
    peer: { ...c.peer, online: isOnline(c.peer.id) },
  }));
  res.json(convs);
}));

app.get('/api/conversations/:id/messages', wrap((req, res) => {
  const conv = db.getConversation(req.params.id);
  if (!conv) return err(res, 404, 'not_found', 'Conversation not found.');
  const limit = Math.min(parseInt(req.query.limit, 10) || 50, 200);
  const before = req.query.before ? parseInt(req.query.before, 10) : null;
  res.json(db.listMessages(conv.id, limit, before));
}));

// Fallback REST send (WS chat:send is canonical).
app.post('/api/conversations/:id/messages', wrap((req, res) => {
  const conv = db.getConversation(req.params.id);
  if (!conv) return err(res, 404, 'not_found', 'Conversation not found.');
  const { senderId, body } = req.body || {};
  if (!senderId || !db.getUser(senderId)) {
    return err(res, 400, 'invalid_sender', 'Valid senderId is required.');
  }
  const text = (body || '').trim();
  if (!text) return err(res, 400, 'empty_body', 'Message body is empty.');
  const msg = db.createMessage(conv.id, senderId, text, 'sent');
  res.status(201).json(msg);
}));

// ---------------------------------------------------------------------------
// Notes
// ---------------------------------------------------------------------------
app.get('/api/notes', wrap((req, res) => {
  const ownerId = req.query.ownerId;
  if (!ownerId) return err(res, 400, 'missing_params', 'ownerId query param is required.');
  res.json(db.listNotes(ownerId));
}));

app.post('/api/notes', wrap((req, res) => {
  const { ownerId, title, body, source, folder, pinned, color, reminderAt, locked, checklist } = req.body || {};
  if (!ownerId || !db.getUser(ownerId)) {
    return err(res, 400, 'invalid_owner', 'Valid ownerId is required.');
  }
  const t = (title || '').trim();
  const b = (body || '').trim();
  if (!t && !b) return err(res, 400, 'empty_note', 'title or body is required.');
  const note = db.createNote({
    ownerId,
    title: t || '(untitled)',
    body: b,
    source: source === 'ai' ? 'ai' : 'manual',
    // Round-2 optional fields (additive; defaults applied when omitted).
    folder: folder !== undefined ? folder : null,
    pinned: pinned ? 1 : 0,
    color: color !== undefined ? color : null,
    reminderAt: reminderAt !== undefined ? reminderAt : null,
    locked: locked ? 1 : 0,
    checklist: checklist !== undefined ? checklist : null,
  });
  res.status(201).json(note);
}));

app.get('/api/notes/:id', wrap((req, res) => {
  const note = db.getNote(req.params.id);
  if (!note) return err(res, 404, 'not_found', 'Note not found.');
  res.json(note);
}));

const NOTE_UPDATE_FIELDS = ['title', 'body', 'folder', 'pinned', 'color', 'reminderAt', 'locked', 'checklist'];
app.put('/api/notes/:id', wrap((req, res) => {
  const body = req.body || {};
  const provided = NOTE_UPDATE_FIELDS.filter((k) => body[k] !== undefined);
  if (provided.length === 0) {
    return err(res, 400, 'missing_params', 'Provide at least one updatable field.');
  }
  const patch = {};
  if (body.title !== undefined) patch.title = String(body.title);
  if (body.body !== undefined) patch.body = String(body.body);
  if (body.folder !== undefined) patch.folder = body.folder;
  if (body.pinned !== undefined) patch.pinned = body.pinned;
  if (body.color !== undefined) patch.color = body.color;
  if (body.reminderAt !== undefined) patch.reminderAt = body.reminderAt;
  if (body.locked !== undefined) patch.locked = body.locked;
  if (body.checklist !== undefined) patch.checklist = body.checklist;
  const note = db.updateNote(req.params.id, patch);
  if (!note) return err(res, 404, 'not_found', 'Note not found.');
  res.json(note);
}));

app.delete('/api/notes/:id', wrap((req, res) => {
  const ok = db.deleteNote(req.params.id);
  if (!ok) return err(res, 404, 'not_found', 'Note not found.');
  res.status(204).end();
}));

// ---------------------------------------------------------------------------
// AI (local, deterministic, offline)
// ---------------------------------------------------------------------------
app.post('/api/ai/generate-note', wrap((req, res) => {
  const { ownerId, conversationId } = req.body || {};
  if (!ownerId || !db.getUser(ownerId)) {
    return err(res, 400, 'invalid_owner', 'Valid ownerId is required.');
  }
  const conv = db.getConversation(conversationId);
  if (!conv) return err(res, 404, 'not_found', 'Conversation not found.');

  const messages = db.listAllMessages(conv.id);
  if (messages.length === 0) {
    return err(res, 400, 'empty_conversation', 'Conversation has no messages to summarize.');
  }

  // Build a userId -> displayName map for the two participants.
  const nameById = {};
  for (const uid of [conv.userA, conv.userB]) {
    const u = db.getUser(uid);
    if (u) nameById[uid] = u.displayName;
  }

  const { title, body, summary, actionItems } = ai.generateNote(messages, nameById);
  const note = db.createNote({ ownerId, title, body, source: 'ai' });
  res.status(201).json({ ...note, summary, actionItems });
}));

app.post('/api/ai/smart-reply', wrap((req, res) => {
  const { conversationId, userId } = req.body || {};
  const conv = db.getConversation(conversationId);
  if (!conv) return err(res, 404, 'not_found', 'Conversation not found.');
  const latest = db.getLatestIncomingMessage(conv.id, userId);
  const suggestions = ai.smartReply(latest);
  res.json({ suggestions });
}));

// ---- Round-2 offline AI endpoints (deterministic, no network, no API key) ----

app.post('/api/ai/tone-adjust', wrap((req, res) => {
  const { text, tone } = req.body || {};
  const t = String(text || '').trim();
  if (!t) return err(res, 400, 'empty_text', 'text is required.');
  if (!ai.VALID_TONES.includes(tone)) {
    return err(res, 400, 'invalid_tone', `tone must be one of: ${ai.VALID_TONES.join(', ')}.`);
  }
  res.json(ai.toneAdjust(t, tone));
}));

app.post('/api/ai/translate', wrap((req, res) => {
  const { text, targetLang } = req.body || {};
  const t = String(text || '').trim();
  if (!t) return err(res, 400, 'empty_text', 'text is required.');
  if (!targetLang || !String(targetLang).trim()) {
    return err(res, 400, 'missing_target_lang', 'targetLang is required.');
  }
  res.json(ai.translate(t, targetLang));
}));

app.post('/api/ai/chat-summary', wrap((req, res) => {
  const { conversationId } = req.body || {};
  const conv = db.getConversation(conversationId);
  if (!conv) return err(res, 404, 'not_found', 'Conversation not found.');
  const messages = db.listAllMessages(conv.id);
  if (messages.length === 0) {
    return err(res, 400, 'empty_conversation', 'Conversation has no messages to summarize.');
  }
  const nameById = {};
  for (const uid of [conv.userA, conv.userB]) {
    const u = db.getUser(uid);
    if (u) nameById[uid] = u.displayName;
  }
  res.json(ai.chatSummary(messages, nameById));
}));

app.post('/api/ai/note-summarize', wrap((req, res) => {
  let { text, noteId } = req.body || {};
  if ((!text || !String(text).trim()) && noteId) {
    const note = db.getNote(noteId);
    if (!note) return err(res, 404, 'not_found', 'Note not found.');
    text = note.body;
  }
  const t = String(text || '').trim();
  if (!t) return err(res, 400, 'empty_text', 'text or a non-empty noteId is required.');
  res.json(ai.summarizeText(t));
}));

app.post('/api/ai/smart-tags', wrap((req, res) => {
  const t = String((req.body && req.body.text) || '').trim();
  if (!t) return err(res, 400, 'empty_text', 'text is required.');
  res.json({ tags: ai.smartTags(t) });
}));

app.post('/api/ai/action-items', wrap((req, res) => {
  const t = String((req.body && req.body.text) || '').trim();
  if (!t) return err(res, 400, 'empty_text', 'text is required.');
  res.json({ actionItems: ai.extractActionItems(t) });
}));

app.post('/api/ai/ask-about-note', wrap((req, res) => {
  const { text, question } = req.body || {};
  const t = String(text || '').trim();
  const q = String(question || '').trim();
  if (!t) return err(res, 400, 'empty_text', 'text is required.');
  if (!q) return err(res, 400, 'empty_question', 'question is required.');
  res.json(ai.askAboutNote(t, q));
}));

// ---------------------------------------------------------------------------
// Call logs (REST path — frontend owns duration timing)
// ---------------------------------------------------------------------------
const VALID_CALL_TYPES = new Set(['voice', 'video']);
const VALID_CALL_STATUS = new Set(['completed', 'missed', 'declined']);

app.post('/api/calls', wrap((req, res) => {
  const { callerId, calleeId, type, status, startedAt, endedAt } = req.body || {};
  if (!callerId || !db.getUser(callerId)) {
    return err(res, 400, 'invalid_caller', 'Valid callerId is required.');
  }
  if (!calleeId || !db.getUser(calleeId)) {
    return err(res, 400, 'invalid_callee', 'Valid calleeId is required.');
  }
  if (!VALID_CALL_TYPES.has(type)) {
    return err(res, 400, 'invalid_type', "type must be 'voice' or 'video'.");
  }
  if (!VALID_CALL_STATUS.has(status)) {
    return err(res, 400, 'invalid_status', "status must be 'completed', 'missed', or 'declined'.");
  }
  const call = db.createCall({
    callerId,
    calleeId,
    type,
    status,
    startedAt: startedAt != null ? Number(startedAt) : undefined,
    endedAt: endedAt != null ? Number(endedAt) : undefined,
  });
  res.status(201).json(call);
}));

app.patch('/api/calls/:id', wrap((req, res) => {
  const { status, endedAt } = req.body || {};
  if (status !== undefined && !VALID_CALL_STATUS.has(status)) {
    return err(res, 400, 'invalid_status', "status must be 'completed', 'missed', or 'declined'.");
  }
  const call = db.updateCall(req.params.id, {
    status,
    endedAt: endedAt !== undefined ? Number(endedAt) : undefined,
  });
  if (!call) return err(res, 404, 'not_found', 'Call log not found.');
  res.json(call);
}));

app.get('/api/calls', wrap((req, res) => {
  const userId = req.query.userId;
  if (!userId) return err(res, 400, 'missing_params', 'userId query param is required.');
  res.json(db.listCalls(userId));
}));

// ---------------------------------------------------------------------------
// Groups (Round-2, minimal: create + list; no media/message fan-out)
// ---------------------------------------------------------------------------
app.post('/api/groups', wrap((req, res) => {
  const { ownerId, name, memberIds } = req.body || {};
  if (!ownerId || !db.getUser(ownerId)) {
    return err(res, 400, 'invalid_owner', 'Valid ownerId is required.');
  }
  const groupName = String(name || '').trim();
  if (!groupName) return err(res, 400, 'missing_name', 'name is required.');
  const ids = Array.isArray(memberIds) ? memberIds : [];
  // Drop unknown member ids silently (owner always included server-side).
  const validIds = ids.filter((id) => typeof id === 'string' && db.getUser(id));
  const group = db.createGroup({ ownerId, name: groupName, memberIds: validIds });
  res.status(201).json(group);
}));

app.get('/api/groups', wrap((req, res) => {
  const userId = req.query.userId;
  if (!userId) return err(res, 400, 'missing_params', 'userId query param is required.');
  res.json(db.listGroupsForUser(userId));
}));

// ---------------------------------------------------------------------------
// Static frontend (same-origin) + SPA-ish fallback
// ---------------------------------------------------------------------------
const PUBLIC_DIR = path.join(__dirname, 'public');
app.use(express.static(PUBLIC_DIR));

// Unknown /api routes -> JSON 404 (don't fall through to index.html).
app.use('/api', (req, res) => err(res, 404, 'not_found', 'Unknown API route.'));

// Everything else serves the PWA shell.
app.get('*', (req, res) => {
  res.sendFile(path.join(PUBLIC_DIR, 'index.html'));
});

// ---------------------------------------------------------------------------
// Boot
// ---------------------------------------------------------------------------
const server = http.createServer(app);
attachWebSocketServer(server);

server.listen(PORT, HOST, () => {
  console.log(`[bevane] HTTP + WS listening on http://${HOST}:${PORT}`);
  console.log(`[bevane] WebSocket endpoint: ws://<host>:${PORT}/ws`);
  console.log(`[bevane] SQLite DB: ${db.DB_PATH}`);
  console.log(`[bevane] Serving static frontend from: ${PUBLIC_DIR}`);
});

module.exports = { app, server };
