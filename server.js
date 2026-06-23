'use strict';

const path = require('path');
const http = require('http');
const express = require('express');

const db   = require('./src/db');
const ai   = require('./src/ai');
const auth = require('./src/auth');
const { attachWebSocketServer, isOnline, broadcast } = require('./src/ws');

const app = express();
app.use(express.json({ limit: '22mb' })); // 15 MB image → ~20 MB base64

const PORT = process.env.PORT || 3000;
const HOST = '0.0.0.0';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function err(res, status, code, message) {
  return res.status(status).json({ error: code, message });
}

function withPresence(user) {
  if (!user) return null;
  return { id: user.id, displayName: user.displayName, online: isOnline(user.id), lastSeenAt: user.lastSeenAt };
}

// Wrap async route handlers so thrown errors become 500s.
function wrap(fn) {
  return async (req, res) => {
    try { await fn(req, res); } catch (e) {
      console.error(e);
      err(res, 500, 'server_error', e.message || 'Internal error');
    }
  };
}

function getBearerToken(req) {
  const h = req.headers.authorization || '';
  return h.startsWith('Bearer ') ? h.slice(7).trim() : null;
}

async function requireAuth(req, res) {
  const token = getBearerToken(req);
  if (!token) { err(res, 401, 'not_authenticated', 'Token required.'); return null; }
  const session = await db.getSession(token);
  if (!session) { err(res, 401, 'invalid_token', 'Token is invalid or expired.'); return null; }
  return session;
}

// ---------------------------------------------------------------------------
// Seed accounts — survive DB resets; users can change passwords via Profile.
// ---------------------------------------------------------------------------
const SEED_ACCOUNTS = [];

async function seedAccounts() {
  for (const { username, displayName, password } of SEED_ACCOUNTS) {
    try {
      if (!await db.getUserByUsername(username)) {
        await db.createUserWithAuth(username, displayName, auth.hashPassword(password));
        console.log(`[bevane] Seeded account: ${username}`);
      }
    } catch (e) {
      console.error(`[bevane] Failed to seed ${username}:`, e.message);
    }
  }
}

// ---------------------------------------------------------------------------
// Auth endpoints
// ---------------------------------------------------------------------------
app.post('/api/auth/register', wrap(async (req, res) => {
  const { username, password, displayName } = req.body || {};
  const u  = String(username    || '').trim();
  const p  = String(password    || '');
  const dn = String(displayName || username || '').trim().slice(0, 40);

  if (!u || u.length < 2 || u.length > 30)
    return err(res, 400, 'invalid_username', 'Username must be 2–30 characters.');
  if (!/^[a-zA-Z0-9._-]+$/.test(u))
    return err(res, 400, 'invalid_username', 'Username may only contain letters, numbers, . _ -');
  if (p.length < 6)
    return err(res, 400, 'password_too_short', 'Password must be at least 6 characters.');
  if (await db.getUserByUsername(u))
    return err(res, 409, 'username_taken', 'That username is already taken.');

  const passwordHash = auth.hashPassword(p);
  const user  = await db.createUserWithAuth(u, dn, passwordHash);
  const token = await db.createSession(user.id);
  res.status(201).json({ id: user.id, displayName: user.displayName, avatarUrl: user.avatarUrl, token });
}));

app.post('/api/auth/login', wrap(async (req, res) => {
  const { username, password } = req.body || {};
  const u = String(username || '').trim();
  const p = String(password || '');
  if (!u || !p)
    return err(res, 400, 'missing_credentials', 'Username and password are required.');
  const user = await db.getUserByUsername(u);
  if (!user || !user.passwordHash || !auth.verifyPassword(p, user.passwordHash))
    return err(res, 401, 'invalid_credentials', 'Incorrect username or password.');
  const token = await db.createSession(user.id);
  res.json({ id: user.id, displayName: user.displayName, avatarUrl: user.avatarUrl, wallpaperUrl: user.wallpaperUrl, token });
}));

app.post('/api/auth/logout', wrap(async (req, res) => {
  await db.deleteSession(getBearerToken(req));
  res.status(204).end();
}));

app.get('/api/auth/me', wrap(async (req, res) => {
  const session = await requireAuth(req, res);
  if (!session) return;
  const user = await db.getUser(session.userId);
  if (!user) return err(res, 401, 'user_not_found', 'User no longer exists.');
  res.json({ id: user.id, displayName: user.displayName, avatarUrl: user.avatarUrl, wallpaperUrl: user.wallpaperUrl });
}));

app.patch('/api/profile', wrap(async (req, res) => {
  const session = await requireAuth(req, res);
  if (!session) return;
  const { displayName, avatarUrl } = req.body || {};
  const updates = {};

  if (displayName != null) {
    const dn = String(displayName).trim();
    if (!dn || dn.length > 40)
      return err(res, 400, 'invalid_display_name', 'Display name must be 1–40 characters.');
    updates.displayName = dn;
  }
  if (avatarUrl != null) {
    if (avatarUrl !== '' && !String(avatarUrl).startsWith('data:image/'))
      return err(res, 400, 'invalid_avatar', 'Avatar must be an image data URL.');
    if (String(avatarUrl).length > 300000)
      return err(res, 400, 'avatar_too_large', 'Avatar image is too large.');
    updates.avatarUrl = avatarUrl || null;
  }

  const updated = await db.updateUser(session.userId, updates);
  res.json({ id: updated.id, displayName: updated.displayName, avatarUrl: updated.avatarUrl });
}));

// Per-conversation wallpaper — any participant can set or clear it.
app.patch('/api/conversations/:id/wallpaper', wrap(async (req, res) => {
  const session = await requireAuth(req, res);
  if (!session) return;
  const conv = await db.getConversation(req.params.id);
  if (!conv) return err(res, 404, 'not_found', 'Conversation not found.');
  if (conv.userA !== session.userId && conv.userB !== session.userId)
    return err(res, 403, 'forbidden', 'Not a participant.');
  const { wallpaperUrl } = req.body || {};
  if (wallpaperUrl && !String(wallpaperUrl).startsWith('data:image/'))
    return err(res, 400, 'invalid_wallpaper', 'Wallpaper must be an image data URL.');
  if (wallpaperUrl && String(wallpaperUrl).length > 800000)
    return err(res, 400, 'wallpaper_too_large', 'Wallpaper image is too large (max ~600 KB).');
  const updated = await db.setConversationWallpaper(conv.id, wallpaperUrl || null);
  broadcast({ type: 'wallpaper_changed', conversationId: conv.id, wallpaperUrl: updated.wallpaperUrl });
  res.json({ conversationId: conv.id, wallpaperUrl: updated.wallpaperUrl });
}));

app.post('/api/auth/change-password', wrap(async (req, res) => {
  const session = await requireAuth(req, res);
  if (!session) return;
  const { currentPassword, newPassword } = req.body || {};
  if (!currentPassword || !newPassword)
    return err(res, 400, 'missing_params', 'currentPassword and newPassword are required.');
  if (String(newPassword).length < 6)
    return err(res, 400, 'password_too_short', 'New password must be at least 6 characters.');
  const userWithAuth = await db.getUserWithAuth(session.userId);
  if (!userWithAuth || !userWithAuth.passwordHash
      || !auth.verifyPassword(currentPassword, userWithAuth.passwordHash))
    return err(res, 401, 'wrong_password', 'Current password is incorrect.');
  await db.updateUserPassword(session.userId, auth.hashPassword(newPassword));
  res.status(204).end();
}));

// ---------------------------------------------------------------------------
// Users
// ---------------------------------------------------------------------------
app.post('/api/users', wrap(async (req, res) => {
  const displayName = String((req.body && req.body.displayName) || '').trim();
  if (!displayName || displayName.length > 40)
    return err(res, 400, 'invalid_display_name', 'displayName must be 1–40 characters.');
  const user = await db.createUser(displayName);
  res.status(201).json({ id: user.id, displayName: user.displayName, createdAt: user.createdAt });
}));

// Visibility rules (hard-coded):
//   NHU  (e2eb7360) → can only see HIEU (a807c3ba)
//   HIEU (a807c3ba) → can see everyone
//   everyone else  → cannot see NHU  (e2eb7360)
const ID_HIEU = 'a807c3ba-567d-49ed-8c4b-2e9e2864bc24';
const ID_NHU  = 'e2eb7360-dc34-45d6-bc67-682c909fc9f0';

function applyVisibility(users, requesterId) {
  if (requesterId === ID_NHU) {
    // Nhu can only see Hieu
    return users.filter((u) => u.id === ID_HIEU);
  }
  if (requesterId !== ID_HIEU) {
    // Everyone else cannot see Nhu
    return users.filter((u) => u.id !== ID_NHU);
  }
  // Hieu sees everyone
  return users;
}

app.get('/api/users', wrap(async (req, res) => {
  const session = await requireAuth(req, res);
  if (!session) return;
  const excludeId = req.query.excludeId;
  let users = await db.listUsers();
  if (excludeId) users = users.filter((u) => u.id !== excludeId);
  users = applyVisibility(users, session.userId);
  res.json(users.map(withPresence));
}));

app.get('/api/users/:id', wrap(async (req, res) => {
  const user = await db.getUser(req.params.id);
  if (!user) return err(res, 404, 'not_found', 'User not found.');
  res.json(withPresence(user));
}));

// ---------------------------------------------------------------------------
// Conversations & Messages
// ---------------------------------------------------------------------------
app.post('/api/conversations', wrap(async (req, res) => {
  const { userId, peerId } = req.body || {};
  if (!userId || !peerId) return err(res, 400, 'missing_params', 'userId and peerId are required.');
  if (userId === peerId) return err(res, 400, 'same_user', 'Cannot open a conversation with yourself.');
  if (!await db.getUser(userId) || !await db.getUser(peerId))
    return err(res, 400, 'user_not_found', 'One or both users do not exist.');
  const { conversation, created } = await db.getOrCreateConversation(userId, peerId);
  res.status(created ? 201 : 200).json(conversation);
}));

app.get('/api/conversations', wrap(async (req, res) => {
  const userId = req.query.userId;
  if (!userId) return err(res, 400, 'missing_params', 'userId query param is required.');
  if (!await db.getUser(userId)) return err(res, 404, 'not_found', 'User not found.');
  const convs = (await db.listConversationsForUser(userId)).map((c) => ({
    ...c,
    peer: { ...c.peer, online: isOnline(c.peer.id) },
  }));
  res.json(convs);
}));

app.get('/api/conversations/:id/messages', wrap(async (req, res) => {
  const conv = await db.getConversation(req.params.id);
  if (!conv) return err(res, 404, 'not_found', 'Conversation not found.');
  const limit  = Math.min(parseInt(req.query.limit, 10) || 50, 200);
  const before = req.query.before ? parseInt(req.query.before, 10) : null;
  res.json(await db.listMessages(conv.id, limit, before));
}));

app.post('/api/conversations/:id/messages', wrap(async (req, res) => {
  const conv = await db.getConversation(req.params.id);
  if (!conv) return err(res, 404, 'not_found', 'Conversation not found.');
  const { senderId, body } = req.body || {};
  if (!senderId || !await db.getUser(senderId))
    return err(res, 400, 'invalid_sender', 'Valid senderId is required.');
  const text = (body || '').trim();
  if (!text) return err(res, 400, 'empty_body', 'Message body is empty.');
  const msg = await db.createMessage(conv.id, senderId, text, 'sent');
  res.status(201).json(msg);
}));

// Media messages (image / file / voice) — requires auth, size-limited per type.
const MEDIA_MAX = { image: 20_000_000, file: 7_000_000, voice: 2_500_000 };
app.post('/api/conversations/:id/media', wrap(async (req, res) => {
  const session = await requireAuth(req, res);
  if (!session) return;
  const conv = await db.getConversation(req.params.id);
  if (!conv) return err(res, 404, 'not_found', 'Conversation not found.');
  if (conv.userA !== session.userId && conv.userB !== session.userId)
    return err(res, 403, 'forbidden', 'Not a participant.');

  const { body, mediaType, filename, clientTempId } = req.body || {};
  if (!body || !mediaType) return err(res, 400, 'missing_params', 'body and mediaType are required.');
  if (!MEDIA_MAX[mediaType]) return err(res, 400, 'invalid_media_type', 'mediaType must be image, file, or voice.');
  if (body.length > MEDIA_MAX[mediaType])
    return err(res, 400, 'media_too_large', `${mediaType} exceeds the size limit.`);

  const peerId = conv.userA === session.userId ? conv.userB : conv.userA;
  const msg = await db.createMessage(conv.id, session.userId, body, 'sent', mediaType, filename || null);

  const { sendToUser } = require('./src/ws');
  sendToUser(session.userId, { type: 'chat:new', message: msg, clientTempId: clientTempId || null });
  const delivered = sendToUser(peerId, { type: 'chat:new', message: msg });
  if (delivered) {
    const updated = await db.setMessageStatus(msg.id, 'delivered');
    sendToUser(session.userId, { type: 'chat:status', messageId: msg.id, status: 'delivered' });
    msg.status = 'delivered';
  }
  res.status(201).json(msg);
}));

// ---------------------------------------------------------------------------
// Notes
// ---------------------------------------------------------------------------
app.get('/api/notes', wrap(async (req, res) => {
  const ownerId = req.query.ownerId;
  if (!ownerId) return err(res, 400, 'missing_params', 'ownerId query param is required.');
  res.json(await db.listNotes(ownerId));
}));

app.post('/api/notes', wrap(async (req, res) => {
  const { ownerId, title, body, source, folder, pinned, color, reminderAt, locked, checklist } = req.body || {};
  if (!ownerId || !await db.getUser(ownerId))
    return err(res, 400, 'invalid_owner', 'Valid ownerId is required.');
  const t = (title || '').trim();
  const b = (body  || '').trim();
  if (!t && !b) return err(res, 400, 'empty_note', 'title or body is required.');
  const note = await db.createNote({
    ownerId,
    title:  t || '(untitled)',
    body:   b,
    source: source === 'ai' ? 'ai' : 'manual',
    folder: folder !== undefined ? folder : null,
    pinned: pinned ? 1 : 0,
    color:  color !== undefined ? color : null,
    reminderAt: reminderAt !== undefined ? reminderAt : null,
    locked: locked ? 1 : 0,
    checklist: checklist !== undefined ? checklist : null,
  });
  res.status(201).json(note);
}));

app.get('/api/notes/:id', wrap(async (req, res) => {
  const note = await db.getNote(req.params.id);
  if (!note) return err(res, 404, 'not_found', 'Note not found.');
  res.json(note);
}));

const NOTE_FIELDS = ['title', 'body', 'folder', 'pinned', 'color', 'reminderAt', 'locked', 'checklist'];
app.put('/api/notes/:id', wrap(async (req, res) => {
  const body = req.body || {};
  if (!NOTE_FIELDS.some((k) => body[k] !== undefined))
    return err(res, 400, 'missing_params', 'Provide at least one updatable field.');
  const patch = {};
  if (body.title      !== undefined) patch.title      = String(body.title);
  if (body.body       !== undefined) patch.body       = String(body.body);
  if (body.folder     !== undefined) patch.folder     = body.folder;
  if (body.pinned     !== undefined) patch.pinned     = body.pinned;
  if (body.color      !== undefined) patch.color      = body.color;
  if (body.reminderAt !== undefined) patch.reminderAt = body.reminderAt;
  if (body.locked     !== undefined) patch.locked     = body.locked;
  if (body.checklist  !== undefined) patch.checklist  = body.checklist;
  const note = await db.updateNote(req.params.id, patch);
  if (!note) return err(res, 404, 'not_found', 'Note not found.');
  res.json(note);
}));

app.delete('/api/notes/:id', wrap(async (req, res) => {
  const ok = await db.deleteNote(req.params.id);
  if (!ok) return err(res, 404, 'not_found', 'Note not found.');
  res.status(204).end();
}));

// ---------------------------------------------------------------------------
// AI (offline / deterministic)
// ---------------------------------------------------------------------------
app.post('/api/ai/generate-note', wrap(async (req, res) => {
  const { ownerId, conversationId } = req.body || {};
  if (!ownerId || !await db.getUser(ownerId))
    return err(res, 400, 'invalid_owner', 'Valid ownerId is required.');
  const conv = await db.getConversation(conversationId);
  if (!conv) return err(res, 404, 'not_found', 'Conversation not found.');
  const messages = await db.listAllMessages(conv.id);
  if (messages.length === 0)
    return err(res, 400, 'empty_conversation', 'Conversation has no messages to summarize.');
  const nameById = {};
  for (const uid of [conv.userA, conv.userB]) {
    const u = await db.getUser(uid);
    if (u) nameById[uid] = u.displayName;
  }
  const { title, body, summary, actionItems } = ai.generateNote(messages, nameById);
  const note = await db.createNote({ ownerId, title, body, source: 'ai' });
  res.status(201).json({ ...note, summary, actionItems });
}));

app.post('/api/ai/smart-reply', wrap(async (req, res) => {
  const { conversationId, userId } = req.body || {};
  const conv = await db.getConversation(conversationId);
  if (!conv) return err(res, 404, 'not_found', 'Conversation not found.');
  const latest = await db.getLatestIncomingMessage(conv.id, userId);
  res.json({ suggestions: ai.smartReply(latest) });
}));

app.post('/api/ai/tone-adjust', wrap(async (req, res) => {
  const { text, tone } = req.body || {};
  const t = String(text || '').trim();
  if (!t) return err(res, 400, 'empty_text', 'text is required.');
  if (!ai.VALID_TONES.includes(tone))
    return err(res, 400, 'invalid_tone', `tone must be one of: ${ai.VALID_TONES.join(', ')}.`);
  res.json(ai.toneAdjust(t, tone));
}));

app.post('/api/ai/translate', wrap(async (req, res) => {
  const { text, targetLang } = req.body || {};
  const t = String(text || '').trim();
  if (!t) return err(res, 400, 'empty_text', 'text is required.');
  if (!targetLang || !String(targetLang).trim())
    return err(res, 400, 'missing_target_lang', 'targetLang is required.');
  res.json(ai.translate(t, targetLang));
}));

app.post('/api/ai/chat-summary', wrap(async (req, res) => {
  const { conversationId } = req.body || {};
  const conv = await db.getConversation(conversationId);
  if (!conv) return err(res, 404, 'not_found', 'Conversation not found.');
  const messages = await db.listAllMessages(conv.id);
  if (messages.length === 0)
    return err(res, 400, 'empty_conversation', 'Conversation has no messages to summarize.');
  const nameById = {};
  for (const uid of [conv.userA, conv.userB]) {
    const u = await db.getUser(uid);
    if (u) nameById[uid] = u.displayName;
  }
  res.json(ai.chatSummary(messages, nameById));
}));

app.post('/api/ai/note-summarize', wrap(async (req, res) => {
  let { text, noteId } = req.body || {};
  if ((!text || !String(text).trim()) && noteId) {
    const note = await db.getNote(noteId);
    if (!note) return err(res, 404, 'not_found', 'Note not found.');
    text = note.body;
  }
  const t = String(text || '').trim();
  if (!t) return err(res, 400, 'empty_text', 'text or a non-empty noteId is required.');
  res.json(ai.summarizeText(t));
}));

app.post('/api/ai/smart-tags', wrap(async (req, res) => {
  const t = String((req.body && req.body.text) || '').trim();
  if (!t) return err(res, 400, 'empty_text', 'text is required.');
  res.json({ tags: ai.smartTags(t) });
}));

app.post('/api/ai/action-items', wrap(async (req, res) => {
  const t = String((req.body && req.body.text) || '').trim();
  if (!t) return err(res, 400, 'empty_text', 'text is required.');
  res.json({ actionItems: ai.extractActionItems(t) });
}));

app.post('/api/ai/ask-about-note', wrap(async (req, res) => {
  const { text, question } = req.body || {};
  const t = String(text     || '').trim();
  const q = String(question || '').trim();
  if (!t) return err(res, 400, 'empty_text',     'text is required.');
  if (!q) return err(res, 400, 'empty_question', 'question is required.');
  res.json(ai.askAboutNote(t, q));
}));

// ---------------------------------------------------------------------------
// Call logs
// ---------------------------------------------------------------------------
const VALID_CALL_TYPES  = new Set(['voice', 'video']);
const VALID_CALL_STATUS = new Set(['completed', 'missed', 'declined']);

app.post('/api/calls', wrap(async (req, res) => {
  const { callerId, calleeId, type, status, startedAt, endedAt } = req.body || {};
  if (!callerId || !await db.getUser(callerId))
    return err(res, 400, 'invalid_caller', 'Valid callerId is required.');
  if (!calleeId || !await db.getUser(calleeId))
    return err(res, 400, 'invalid_callee', 'Valid calleeId is required.');
  if (!VALID_CALL_TYPES.has(type))
    return err(res, 400, 'invalid_type', "type must be 'voice' or 'video'.");
  if (!VALID_CALL_STATUS.has(status))
    return err(res, 400, 'invalid_status', "status must be 'completed', 'missed', or 'declined'.");
  const call = await db.createCall({
    callerId, calleeId, type, status,
    startedAt: startedAt != null ? Number(startedAt) : undefined,
    endedAt:   endedAt   != null ? Number(endedAt)   : undefined,
  });
  res.status(201).json(call);
}));

app.patch('/api/calls/:id', wrap(async (req, res) => {
  const { status, endedAt } = req.body || {};
  if (status !== undefined && !VALID_CALL_STATUS.has(status))
    return err(res, 400, 'invalid_status', "status must be 'completed', 'missed', or 'declined'.");
  const call = await db.updateCall(req.params.id, {
    status,
    endedAt: endedAt !== undefined ? Number(endedAt) : undefined,
  });
  if (!call) return err(res, 404, 'not_found', 'Call log not found.');
  res.json(call);
}));

app.get('/api/calls', wrap(async (req, res) => {
  const userId = req.query.userId;
  if (!userId) return err(res, 400, 'missing_params', 'userId query param is required.');
  res.json(await db.listCalls(userId));
}));

// ---------------------------------------------------------------------------
// Groups
// ---------------------------------------------------------------------------
app.post('/api/groups', wrap(async (req, res) => {
  const { ownerId, name, memberIds } = req.body || {};
  if (!ownerId || !await db.getUser(ownerId))
    return err(res, 400, 'invalid_owner', 'Valid ownerId is required.');
  const groupName = String(name || '').trim();
  if (!groupName) return err(res, 400, 'missing_name', 'name is required.');
  const ids      = Array.isArray(memberIds) ? memberIds : [];
  const validIds = (await Promise.all(ids.map(async (id) => (typeof id === 'string' && await db.getUser(id)) ? id : null)))
    .filter(Boolean);
  const group = await db.createGroup({ ownerId, name: groupName, memberIds: validIds });
  res.status(201).json(group);
}));

app.get('/api/groups', wrap(async (req, res) => {
  const userId = req.query.userId;
  if (!userId) return err(res, 400, 'missing_params', 'userId query param is required.');
  res.json(await db.listGroupsForUser(userId));
}));

// ---------------------------------------------------------------------------
// Static frontend + SPA fallback
// ---------------------------------------------------------------------------
const PUBLIC_DIR = path.join(__dirname, 'public');
app.use(express.static(PUBLIC_DIR));
app.use('/api', (req, res) => err(res, 404, 'not_found', 'Unknown API route.'));
app.get('*', (req, res) => res.sendFile(path.join(PUBLIC_DIR, 'index.html')));

// ---------------------------------------------------------------------------
// Boot
// ---------------------------------------------------------------------------
const server = http.createServer(app);
attachWebSocketServer(server);

async function startup() {
  await db.init();
  await seedAccounts();

  server.listen(PORT, HOST, () => {
    console.log(`[bevane] HTTP + WS listening on http://${HOST}:${PORT}`);
    console.log(`[bevane] WebSocket endpoint: ws://<host>:${PORT}/ws`);
    console.log(`[bevane] DB: ${db.DB_PATH}`);
    console.log(`[bevane] Serving static frontend from: ${PUBLIC_DIR}`);

    const renderUrl = process.env.RENDER_EXTERNAL_URL;
    if (renderUrl) {
      const pingUrl = `${renderUrl}/api/users`;
      setInterval(() => {
        fetch(pingUrl, { signal: AbortSignal.timeout(10000) }).catch(() => {});
      }, 14 * 60 * 1000);
      console.log(`[bevane] Keep-alive ping scheduled → ${pingUrl}`);
    }
  });
}

startup().catch((e) => { console.error('[bevane] startup failed:', e); process.exit(1); });

module.exports = { app, server };
