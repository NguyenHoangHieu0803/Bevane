'use strict';

/**
 * Bevane — persistence layer.
 *
 * Uses @libsql/client (Turso SQLite cloud when TURSO_DATABASE_URL is set,
 * local SQLite file otherwise). All exported functions are async.
 */

const { createClient } = require('@libsql/client');
const { randomUUID } = require('crypto');
const path = require('path');
const fs = require('fs');

function now() { return Date.now(); }

function buildClient() {
  const url = process.env.TURSO_DATABASE_URL;
  if (url) {
    return createClient({ url, authToken: process.env.TURSO_AUTH_TOKEN || '' });
  }
  const DATA_DIR = path.join(__dirname, '..', 'data');
  fs.mkdirSync(DATA_DIR, { recursive: true });
  const dbPath = process.env.BEVANE_DB || path.join(DATA_DIR, 'bevane.db');
  return createClient({ url: `file:${dbPath}` });
}

const db = buildClient();

const DB_PATH = process.env.TURSO_DATABASE_URL
  ? `turso:${process.env.TURSO_DATABASE_URL}`
  : (process.env.BEVANE_DB || 'data/bevane.db');

// ---------------------------------------------------------------------------
// Query helpers
// ---------------------------------------------------------------------------
async function run(sql, args) {
  return db.execute(args !== undefined ? { sql, args } : sql);
}

async function get(sql, args) {
  const res = await db.execute(args !== undefined ? { sql, args } : sql);
  return res.rows[0] || null;
}

async function all(sql, args) {
  const res = await db.execute(args !== undefined ? { sql, args } : sql);
  return res.rows;
}

async function addColumnIfMissing(table, column, definition) {
  try {
    await run(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`);
  } catch (e) {
    const msg = (e.message || '').toLowerCase();
    if (!msg.includes('duplicate column') && !msg.includes('already exists')) throw e;
  }
}

// ---------------------------------------------------------------------------
// Schema init + migrations (call once on startup before serving requests)
// ---------------------------------------------------------------------------
async function init() {
  const stmts = [
    `CREATE TABLE IF NOT EXISTS users (
      id            TEXT PRIMARY KEY,
      display_name  TEXT NOT NULL,
      created_at    INTEGER NOT NULL,
      last_seen_at  INTEGER
    )`,
    `CREATE TABLE IF NOT EXISTS conversations (
      id          TEXT PRIMARY KEY,
      user_a      TEXT NOT NULL,
      user_b      TEXT NOT NULL,
      created_at  INTEGER NOT NULL
    )`,
    `CREATE UNIQUE INDEX IF NOT EXISTS idx_conversations_pair
       ON conversations(user_a, user_b)`,
    `CREATE TABLE IF NOT EXISTS messages (
      id               TEXT PRIMARY KEY,
      conversation_id  TEXT NOT NULL,
      sender_id        TEXT NOT NULL,
      body             TEXT NOT NULL,
      status           TEXT NOT NULL,
      created_at       INTEGER NOT NULL
    )`,
    `CREATE INDEX IF NOT EXISTS idx_messages_conv_time
       ON messages(conversation_id, created_at)`,
    `CREATE TABLE IF NOT EXISTS notes (
      id          TEXT PRIMARY KEY,
      owner_id    TEXT NOT NULL,
      title       TEXT NOT NULL,
      body        TEXT NOT NULL,
      source      TEXT NOT NULL DEFAULT 'manual',
      created_at  INTEGER NOT NULL,
      updated_at  INTEGER NOT NULL
    )`,
    `CREATE INDEX IF NOT EXISTS idx_notes_owner_updated
       ON notes(owner_id, updated_at)`,
    `CREATE TABLE IF NOT EXISTS call_logs (
      id            TEXT PRIMARY KEY,
      caller_id     TEXT NOT NULL,
      callee_id     TEXT NOT NULL,
      type          TEXT NOT NULL,
      status        TEXT NOT NULL,
      started_at    INTEGER NOT NULL,
      ended_at      INTEGER,
      duration_sec  INTEGER
    )`,
    `CREATE INDEX IF NOT EXISTS idx_calls_caller ON call_logs(caller_id, started_at)`,
    `CREATE INDEX IF NOT EXISTS idx_calls_callee ON call_logs(callee_id, started_at)`,
    `CREATE TABLE IF NOT EXISTS sessions (
      token       TEXT PRIMARY KEY,
      user_id     TEXT NOT NULL,
      created_at  INTEGER NOT NULL,
      expires_at  INTEGER NOT NULL
    )`,
    `CREATE INDEX IF NOT EXISTS idx_sessions_user ON sessions(user_id)`,
    `CREATE TABLE IF NOT EXISTS groups (
      id          TEXT PRIMARY KEY,
      name        TEXT NOT NULL,
      owner_id    TEXT NOT NULL,
      created_at  INTEGER NOT NULL
    )`,
    `CREATE TABLE IF NOT EXISTS group_members (
      group_id    TEXT NOT NULL,
      user_id     TEXT NOT NULL,
      joined_at   INTEGER NOT NULL,
      PRIMARY KEY (group_id, user_id)
    )`,
    `CREATE INDEX IF NOT EXISTS idx_group_members_user ON group_members(user_id)`,
  ];

  // Run each DDL individually so one failure doesn't block others
  for (const s of stmts) {
    try { await run(s); } catch { /* index/table exists */ }
  }

  // Partial index for unique usernames
  try {
    await run(
      `CREATE UNIQUE INDEX IF NOT EXISTS idx_users_username ON users(username) WHERE username IS NOT NULL`
    );
  } catch { /* SQLite without partial index support */ }

  // Additive column migrations
  await addColumnIfMissing('users', 'username',      'TEXT');
  await addColumnIfMissing('users', 'password_hash', 'TEXT');
  await addColumnIfMissing('users', 'avatar_url',    'TEXT');
  await addColumnIfMissing('users', 'wallpaper_url', 'TEXT');
  await addColumnIfMissing('notes', 'folder',        'TEXT');
  await addColumnIfMissing('notes', 'pinned',        'INTEGER NOT NULL DEFAULT 0');
  await addColumnIfMissing('notes', 'color',         'TEXT');
  await addColumnIfMissing('notes', 'reminder_at',   'INTEGER');
  await addColumnIfMissing('notes', 'locked',        'INTEGER NOT NULL DEFAULT 0');
  await addColumnIfMissing('notes', 'checklist',     'TEXT');
  await addColumnIfMissing('messages', 'reply_to',   'TEXT');
  await addColumnIfMissing('messages', 'deleted',    'INTEGER NOT NULL DEFAULT 0');
  await addColumnIfMissing('messages', 'reactions',  'TEXT');
  await addColumnIfMissing('messages', 'media_type', 'TEXT');
  await addColumnIfMissing('messages', 'filename',   'TEXT');
  await addColumnIfMissing('conversations', 'wallpaper_url', 'TEXT');
}

// ---------------------------------------------------------------------------
// Row mappers (snake_case DB -> camelCase API)
// ---------------------------------------------------------------------------
function mapUser(row) {
  if (!row) return null;
  return {
    id:           row.id,
    displayName:  row.display_name,
    avatarUrl:    row.avatar_url    || null,
    wallpaperUrl: row.wallpaper_url || null,
    createdAt:    Number(row.created_at),
    lastSeenAt:   row.last_seen_at ? Number(row.last_seen_at) : null,
  };
}

function mapConversation(row) {
  if (!row) return null;
  return {
    id:           row.id,
    userA:        row.user_a,
    userB:        row.user_b,
    createdAt:    Number(row.created_at),
    wallpaperUrl: row.wallpaper_url || null,
  };
}

function parseJson(value, fallback) {
  if (value == null) return fallback;
  try { return JSON.parse(value); } catch { return fallback; }
}

function mapMessage(row) {
  if (!row) return null;
  return {
    id:             row.id,
    conversationId: row.conversation_id,
    senderId:       row.sender_id,
    body:           row.body,
    status:         row.status,
    createdAt:      Number(row.created_at),
    replyTo:        row.reply_to  != null ? row.reply_to  : null,
    deleted:        row.deleted   ? 1 : 0,
    reactions:      parseJson(row.reactions, {}),
    mediaType:      row.media_type || null,
    filename:       row.filename   || null,
  };
}

function mapNote(row) {
  if (!row) return null;
  return {
    id:         row.id,
    ownerId:    row.owner_id,
    title:      row.title,
    body:       row.body,
    source:     row.source,
    createdAt:  Number(row.created_at),
    updatedAt:  Number(row.updated_at),
    folder:     row.folder      != null ? row.folder      : null,
    pinned:     row.pinned      ? 1 : 0,
    color:      row.color       != null ? row.color       : null,
    reminderAt: row.reminder_at != null ? Number(row.reminder_at) : null,
    locked:     row.locked      ? 1 : 0,
    checklist:  parseJson(row.checklist, null),
  };
}

function mapCall(row) {
  if (!row) return null;
  return {
    id:          row.id,
    callerId:    row.caller_id,
    calleeId:    row.callee_id,
    type:        row.type,
    status:      row.status,
    startedAt:   Number(row.started_at),
    endedAt:     row.ended_at     != null ? Number(row.ended_at)     : null,
    durationSec: row.duration_sec != null ? Number(row.duration_sec) : null,
  };
}

// ---------------------------------------------------------------------------
// Users
// ---------------------------------------------------------------------------
async function createUser(displayName) {
  const id = randomUUID();
  const ts = now();
  await run(
    `INSERT INTO users (id, display_name, created_at, last_seen_at) VALUES (?, ?, ?, ?)`,
    [id, displayName, ts, ts]
  );
  return getUser(id);
}

async function getUser(id) {
  return mapUser(await get(`SELECT * FROM users WHERE id = ?`, [id]));
}

async function listUsers() {
  const rows = await all(
    `SELECT * FROM users WHERE username IS NOT NULL ORDER BY display_name COLLATE NOCASE ASC`
  );
  return rows.map(mapUser);
}

async function touchUser(id, ts = now()) {
  await run(`UPDATE users SET last_seen_at = ? WHERE id = ?`, [ts, id]);
}

async function updateUser(id, { displayName, avatarUrl, wallpaperUrl } = {}) {
  await run(
    `UPDATE users
        SET display_name  = CASE WHEN @displayName  IS NOT NULL THEN @displayName  ELSE display_name  END,
            avatar_url    = CASE WHEN @avatarUrl    IS NOT NULL THEN @avatarUrl    ELSE avatar_url    END,
            wallpaper_url = CASE WHEN @wallpaperUrl IS NOT NULL THEN @wallpaperUrl ELSE wallpaper_url END
      WHERE id = @id`,
    {
      id,
      displayName:  displayName  != null ? String(displayName).trim() : null,
      avatarUrl:    avatarUrl    != null ? avatarUrl    : null,
      wallpaperUrl: wallpaperUrl != null ? wallpaperUrl : null,
    }
  );
  return getUser(id);
}

async function updateUserPassword(id, passwordHash) {
  await run(`UPDATE users SET password_hash = ? WHERE id = ?`, [passwordHash, id]);
}

async function getUserWithAuth(id) {
  const row = await get(`SELECT * FROM users WHERE id = ?`, [id]);
  if (!row) return null;
  return { ...mapUser(row), username: row.username, passwordHash: row.password_hash };
}

// ---------------------------------------------------------------------------
// Auth — users with credentials
// ---------------------------------------------------------------------------
async function createUserWithAuth(username, displayName, passwordHash) {
  const id = randomUUID();
  const ts = now();
  await run(
    `INSERT INTO users (id, display_name, username, password_hash, created_at, last_seen_at)
     VALUES (?, ?, ?, ?, ?, ?)`,
    [id, displayName || username, username, passwordHash, ts, ts]
  );
  return getUser(id);
}

async function getUserByUsername(username) {
  const row = await get(`SELECT * FROM users WHERE username = ?`, [username]);
  if (!row) return null;
  return { ...mapUser(row), username: row.username, passwordHash: row.password_hash };
}

// ---------------------------------------------------------------------------
// Sessions
// ---------------------------------------------------------------------------
const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000;

async function createSession(userId) {
  const token = randomUUID();
  const ts    = now();
  await run(`DELETE FROM sessions WHERE expires_at < ?`, [ts]);
  await run(
    `INSERT INTO sessions (token, user_id, created_at, expires_at) VALUES (?, ?, ?, ?)`,
    [token, userId, ts, ts + SESSION_TTL_MS]
  );
  return token;
}

async function getSession(token) {
  if (!token) return null;
  const row = await get(`SELECT * FROM sessions WHERE token = ?`, [token]);
  if (!row) return null;
  if (Number(row.expires_at) < now()) {
    await run(`DELETE FROM sessions WHERE token = ?`, [token]);
    return null;
  }
  return { token: row.token, userId: row.user_id, createdAt: Number(row.created_at), expiresAt: Number(row.expires_at) };
}

async function deleteSession(token) {
  if (token) await run(`DELETE FROM sessions WHERE token = ?`, [token]);
}

// ---------------------------------------------------------------------------
// Conversations
// ---------------------------------------------------------------------------
async function getOrCreateConversation(userId, peerId) {
  const [a, b] = [userId, peerId].sort();
  const existing = await get(
    `SELECT * FROM conversations WHERE user_a = ? AND user_b = ?`, [a, b]
  );
  if (existing) return { conversation: mapConversation(existing), created: false };
  const id = randomUUID();
  await run(
    `INSERT INTO conversations (id, user_a, user_b, created_at) VALUES (?, ?, ?, ?)`,
    [id, a, b, now()]
  );
  return { conversation: mapConversation(await get(`SELECT * FROM conversations WHERE id = ?`, [id])), created: true };
}

async function getConversation(id) {
  return mapConversation(await get(`SELECT * FROM conversations WHERE id = ?`, [id]));
}

async function setConversationWallpaper(id, url) {
  await run(
    `UPDATE conversations SET wallpaper_url = @url WHERE id = @id`,
    { url: url || null, id }
  );
  return getConversation(id);
}

async function listConversationsForUser(userId) {
  const rows = await all(
    `SELECT * FROM conversations WHERE user_a = ? OR user_b = ?`, [userId, userId]
  );
  const result = await Promise.all(rows.map(async (row) => {
    const conv   = mapConversation(row);
    const peerId = conv.userA === userId ? conv.userB : conv.userA;
    const peer   = await getUser(peerId);
    const lastRow = await get(
      `SELECT * FROM messages WHERE conversation_id = ? ORDER BY created_at DESC LIMIT 1`,
      [conv.id]
    );
    const last = mapMessage(lastRow);
    return {
      id:           conv.id,
      wallpaperUrl: conv.wallpaperUrl,
      peer:         peer
        ? { id: peer.id, displayName: peer.displayName, avatarUrl: peer.avatarUrl }
        : { id: peerId, displayName: '(unknown)', avatarUrl: null },
      lastMessage: last
        ? { body: last.body, createdAt: last.createdAt, senderId: last.senderId }
        : null,
      createdAt: conv.createdAt,
    };
  }));
  result.sort((x, y) => {
    const xa = x.lastMessage ? x.lastMessage.createdAt : x.createdAt;
    const ya = y.lastMessage ? y.lastMessage.createdAt : y.createdAt;
    return ya - xa;
  });
  return result;
}

// ---------------------------------------------------------------------------
// Messages
// ---------------------------------------------------------------------------
async function createMessage(conversationId, senderId, body, status = 'sent', mediaType = null, filename = null) {
  const id = randomUUID();
  const ts = now();
  await run(
    `INSERT INTO messages (id, conversation_id, sender_id, body, status, created_at, media_type, filename)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    [id, conversationId, senderId, body || null, status, ts, mediaType || null, filename || null]
  );
  return getMessage(id);
}

async function getMessage(id) {
  return mapMessage(await get(`SELECT * FROM messages WHERE id = ?`, [id]));
}

async function setMessageStatus(id, status) {
  await run(`UPDATE messages SET status = ? WHERE id = ?`, [status, id]);
  return getMessage(id);
}

async function listMessages(conversationId, limit = 50, before = null) {
  const rows = before == null
    ? await all(
        `SELECT * FROM messages WHERE conversation_id = ? ORDER BY created_at DESC LIMIT ?`,
        [conversationId, limit]
      )
    : await all(
        `SELECT * FROM messages WHERE conversation_id = ? AND created_at < ? ORDER BY created_at DESC LIMIT ?`,
        [conversationId, before, limit]
      );
  return rows.map(mapMessage).reverse();
}

async function listAllMessages(conversationId) {
  const rows = await all(
    `SELECT * FROM messages WHERE conversation_id = ? ORDER BY created_at ASC`,
    [conversationId]
  );
  return rows.map(mapMessage);
}

async function getLatestIncomingMessage(conversationId, userId) {
  return mapMessage(await get(
    `SELECT * FROM messages WHERE conversation_id = ? AND sender_id != ?
     ORDER BY created_at DESC LIMIT 1`,
    [conversationId, userId]
  ));
}

async function markConversationRead(conversationId, userId) {
  const rows = await all(
    `SELECT * FROM messages WHERE conversation_id = ? AND sender_id != ? AND status != 'read'`,
    [conversationId, userId]
  );
  if (rows.length > 0) {
    await db.batch(
      rows.map((r) => ({ sql: `UPDATE messages SET status = 'read' WHERE id = ?`, args: [r.id] })),
      'write'
    );
  }
  return rows.map(mapMessage);
}

// ---------------------------------------------------------------------------
// Notes
// ---------------------------------------------------------------------------
function normalizeChecklist(value) {
  if (value == null) return null;
  if (typeof value === 'string') {
    const parsed = parseJson(value, undefined);
    return Array.isArray(parsed) ? JSON.stringify(parsed) : null;
  }
  if (Array.isArray(value)) return JSON.stringify(value);
  return null;
}

async function createNote({ ownerId, title, body, source = 'manual',
  folder = null, pinned = 0, color = null, reminderAt = null, locked = 0, checklist = null }) {
  const id = randomUUID();
  const ts = now();
  await run(
    `INSERT INTO notes
       (id, owner_id, title, body, source, created_at, updated_at,
        folder, pinned, color, reminder_at, locked, checklist)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      id, ownerId, title, body, source, ts, ts,
      folder  != null ? String(folder)  : null,
      pinned  ? 1 : 0,
      color   != null ? String(color)   : null,
      reminderAt != null ? Number(reminderAt) : null,
      locked  ? 1 : 0,
      normalizeChecklist(checklist),
    ]
  );
  return getNote(id);
}

async function getNote(id) {
  return mapNote(await get(`SELECT * FROM notes WHERE id = ?`, [id]));
}

async function listNotes(ownerId) {
  const rows = await all(
    `SELECT * FROM notes WHERE owner_id = ? ORDER BY pinned DESC, updated_at DESC`,
    [ownerId]
  );
  return rows.map(mapNote);
}

async function updateNote(id, fields) {
  const existing = await getNote(id);
  if (!existing) return null;
  const f = fields || {};
  const pick = (key, current) => (f[key] !== undefined ? f[key] : current);
  const newTitle    = pick('title',    existing.title);
  const newBody     = pick('body',     existing.body);
  const newFolder   = pick('folder',   existing.folder);
  const newPinned   = f.pinned   !== undefined ? (f.pinned   ? 1 : 0) : existing.pinned;
  const newColor    = pick('color',    existing.color);
  const newReminder = f.reminderAt !== undefined ? (f.reminderAt != null ? Number(f.reminderAt) : null) : existing.reminderAt;
  const newLocked   = f.locked    !== undefined ? (f.locked   ? 1 : 0) : existing.locked;
  const newChecklist = f.checklist !== undefined
    ? normalizeChecklist(f.checklist)
    : (existing.checklist != null ? JSON.stringify(existing.checklist) : null);
  await run(
    `UPDATE notes
        SET title = ?, body = ?, folder = ?, pinned = ?, color = ?,
            reminder_at = ?, locked = ?, checklist = ?, updated_at = ?
      WHERE id = ?`,
    [
      newTitle, newBody,
      newFolder   != null ? String(newFolder)  : null,
      newPinned   ? 1 : 0,
      newColor    != null ? String(newColor)   : null,
      newReminder != null ? Number(newReminder) : null,
      newLocked   ? 1 : 0,
      newChecklist,
      now(),
      id,
    ]
  );
  return getNote(id);
}

async function deleteNote(id) {
  const res = await run(`DELETE FROM notes WHERE id = ?`, [id]);
  return (res.rowsAffected || 0) > 0;
}

// ---------------------------------------------------------------------------
// Call logs
// ---------------------------------------------------------------------------
function computeDuration(status, startedAt, endedAt) {
  if (status === 'missed' || status === 'declined') return 0;
  if (startedAt != null && endedAt != null) return Math.max(0, Math.round((endedAt - startedAt) / 1000));
  return null;
}

async function createCall({ callerId, calleeId, type, status, startedAt, endedAt }) {
  const id    = randomUUID();
  const start = startedAt != null ? startedAt : now();
  const durSec = computeDuration(status, start, endedAt ?? null);
  await run(
    `INSERT INTO call_logs (id, caller_id, callee_id, type, status, started_at, ended_at, duration_sec)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    [id, callerId, calleeId, type, status, start, endedAt ?? null, durSec]
  );
  return getCall(id);
}

async function getCall(id) {
  return mapCall(await get(`SELECT * FROM call_logs WHERE id = ?`, [id]));
}

async function updateCall(id, { status, endedAt }) {
  const existing = await getCall(id);
  if (!existing) return null;
  const newStatus  = status   !== undefined ? status   : existing.status;
  const newEndedAt = endedAt  !== undefined ? endedAt  : existing.endedAt;
  const durSec = computeDuration(newStatus, existing.startedAt, newEndedAt);
  await run(
    `UPDATE call_logs SET status = ?, ended_at = ?, duration_sec = ? WHERE id = ?`,
    [newStatus, newEndedAt, durSec, id]
  );
  return getCall(id);
}

async function listCalls(userId) {
  const rows = await all(
    `SELECT * FROM call_logs WHERE caller_id = ? OR callee_id = ? ORDER BY started_at DESC`,
    [userId, userId]
  );
  return rows.map(mapCall);
}

// ---------------------------------------------------------------------------
// Groups
// ---------------------------------------------------------------------------
async function createGroup({ ownerId, name, memberIds = [] }) {
  const id      = randomUUID();
  const ts      = now();
  const members = [...new Set([ownerId, ...memberIds])];
  await db.batch([
    { sql: `INSERT INTO groups (id, name, owner_id, created_at) VALUES (?, ?, ?, ?)`, args: [id, name, ownerId, ts] },
    ...members.map((uid) => ({
      sql:  `INSERT OR IGNORE INTO group_members (group_id, user_id, joined_at) VALUES (?, ?, ?)`,
      args: [id, uid, ts],
    })),
  ], 'write');
  return getGroup(id);
}

async function getGroup(id) {
  const row = await get(`SELECT * FROM groups WHERE id = ?`, [id]);
  if (!row) return null;
  const memberRows = await all(`SELECT user_id FROM group_members WHERE group_id = ? ORDER BY joined_at ASC`, [id]);
  return { id: row.id, name: row.name, ownerId: row.owner_id, memberIds: memberRows.map((r) => r.user_id), createdAt: Number(row.created_at) };
}

async function listGroupsForUser(userId) {
  const rows = await all(
    `SELECT DISTINCT g.* FROM groups g
       JOIN group_members gm ON gm.group_id = g.id
      WHERE gm.user_id = ?
      ORDER BY g.created_at DESC`,
    [userId]
  );
  return Promise.all(rows.map((r) => getGroup(r.id)));
}

module.exports = {
  DB_PATH,
  init,
  // users
  createUser,
  getUser,
  listUsers,
  touchUser,
  updateUser,
  updateUserPassword,
  getUserWithAuth,
  // conversations
  getOrCreateConversation,
  getConversation,
  setConversationWallpaper,
  listConversationsForUser,
  // messages
  createMessage,
  getMessage,
  setMessageStatus,
  listMessages,
  listAllMessages,
  getLatestIncomingMessage,
  markConversationRead,
  // notes
  createNote,
  getNote,
  listNotes,
  updateNote,
  deleteNote,
  // calls
  createCall,
  updateCall,
  getCall,
  listCalls,
  computeDuration,
  // groups
  createGroup,
  getGroup,
  listGroupsForUser,
  // auth
  createUserWithAuth,
  getUserByUsername,
  // sessions
  createSession,
  getSession,
  deleteSession,
};
