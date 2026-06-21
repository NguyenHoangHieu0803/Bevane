'use strict';

/**
 * Bevane — SQLite persistence layer (better-sqlite3, synchronous).
 *
 * - Auto-creates the data directory and DB file on boot.
 * - Creates all 5 tables idempotently (per BA data model).
 * - Exports query helpers used by the REST + WS layers.
 *
 * Timestamps are epoch milliseconds (integers). Primary keys are UUID strings.
 */

const path = require('path');
const fs = require('fs');
const { DatabaseSync } = require('node:sqlite');

const DATA_DIR = path.join(__dirname, '..', 'data');
const DB_PATH = process.env.BEVANE_DB || path.join(DATA_DIR, 'bevane.db');

// Ensure the data directory exists.
fs.mkdirSync(DATA_DIR, { recursive: true });

const db = new DatabaseSync(DB_PATH);
db.exec('PRAGMA journal_mode = WAL');
db.exec('PRAGMA foreign_keys = ON');

function now() {
  return Date.now();
}

// ---------------------------------------------------------------------------
// Schema (idempotent migration)
// ---------------------------------------------------------------------------
db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id            TEXT PRIMARY KEY,
    display_name  TEXT NOT NULL,
    created_at    INTEGER NOT NULL,
    last_seen_at  INTEGER
  );

  CREATE TABLE IF NOT EXISTS conversations (
    id          TEXT PRIMARY KEY,
    user_a      TEXT NOT NULL,
    user_b      TEXT NOT NULL,
    created_at  INTEGER NOT NULL,
    FOREIGN KEY (user_a) REFERENCES users(id),
    FOREIGN KEY (user_b) REFERENCES users(id)
  );
  CREATE UNIQUE INDEX IF NOT EXISTS idx_conversations_pair
    ON conversations(user_a, user_b);

  CREATE TABLE IF NOT EXISTS messages (
    id               TEXT PRIMARY KEY,
    conversation_id  TEXT NOT NULL,
    sender_id        TEXT NOT NULL,
    body             TEXT NOT NULL,
    status           TEXT NOT NULL,
    created_at       INTEGER NOT NULL,
    FOREIGN KEY (conversation_id) REFERENCES conversations(id),
    FOREIGN KEY (sender_id) REFERENCES users(id)
  );
  CREATE INDEX IF NOT EXISTS idx_messages_conv_time
    ON messages(conversation_id, created_at);

  CREATE TABLE IF NOT EXISTS notes (
    id          TEXT PRIMARY KEY,
    owner_id    TEXT NOT NULL,
    title       TEXT NOT NULL,
    body        TEXT NOT NULL,
    source      TEXT NOT NULL DEFAULT 'manual',
    created_at  INTEGER NOT NULL,
    updated_at  INTEGER NOT NULL,
    FOREIGN KEY (owner_id) REFERENCES users(id)
  );
  CREATE INDEX IF NOT EXISTS idx_notes_owner_updated
    ON notes(owner_id, updated_at);

  CREATE TABLE IF NOT EXISTS call_logs (
    id            TEXT PRIMARY KEY,
    caller_id     TEXT NOT NULL,
    callee_id     TEXT NOT NULL,
    type          TEXT NOT NULL,
    status        TEXT NOT NULL,
    started_at    INTEGER NOT NULL,
    ended_at      INTEGER,
    duration_sec  INTEGER,
    FOREIGN KEY (caller_id) REFERENCES users(id),
    FOREIGN KEY (callee_id) REFERENCES users(id)
  );
  CREATE INDEX IF NOT EXISTS idx_calls_caller ON call_logs(caller_id, started_at);
  CREATE INDEX IF NOT EXISTS idx_calls_callee ON call_logs(callee_id, started_at);

  -- Auth: sessions keyed by random UUID token.
  CREATE TABLE IF NOT EXISTS sessions (
    token       TEXT PRIMARY KEY,
    user_id     TEXT NOT NULL,
    created_at  INTEGER NOT NULL,
    expires_at  INTEGER NOT NULL,
    FOREIGN KEY (user_id) REFERENCES users(id)
  );
  CREATE INDEX IF NOT EXISTS idx_sessions_user ON sessions(user_id);

  -- Round-2: groups (OPTIONAL/MINIMAL — storage + listing only, no media fan-out).
  CREATE TABLE IF NOT EXISTS groups (
    id          TEXT PRIMARY KEY,
    name        TEXT NOT NULL,
    owner_id    TEXT NOT NULL,
    created_at  INTEGER NOT NULL
  );

  CREATE TABLE IF NOT EXISTS group_members (
    group_id    TEXT NOT NULL,
    user_id     TEXT NOT NULL,
    joined_at   INTEGER NOT NULL,
    PRIMARY KEY (group_id, user_id)
  );
  CREATE INDEX IF NOT EXISTS idx_group_members_user ON group_members(user_id);
`);

// ---------------------------------------------------------------------------
// Round-2 additive migration (idempotent): add new nullable columns to existing
// tables. Guarded by PRAGMA table_info so re-running is safe and existing rows
// keep their defaults. Never destructive.
// ---------------------------------------------------------------------------
function addColumnIfMissing(table, column, definition) {
  const cols = db.prepare(`PRAGMA table_info(${table})`).all();
  if (!cols.some((c) => c.name === column)) {
    db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`);
  }
}

// Users: username and password_hash for account-based auth.
addColumnIfMissing('users', 'username', 'TEXT');
addColumnIfMissing('users', 'password_hash', 'TEXT');
// Partial unique index: two accounts cannot share a username, but legacy
// anonymous rows (username IS NULL) are excluded from the constraint.
try {
  db.exec(
    'CREATE UNIQUE INDEX IF NOT EXISTS idx_users_username ON users(username) WHERE username IS NOT NULL'
  );
} catch { /* SQLite < 3.15 may not support partial indices — tolerate */ }

// Notes: folder, pinned, color, reminder_at, locked, checklist.
addColumnIfMissing('notes', 'folder', 'TEXT');
addColumnIfMissing('notes', 'pinned', 'INTEGER NOT NULL DEFAULT 0');
addColumnIfMissing('notes', 'color', 'TEXT');
addColumnIfMissing('notes', 'reminder_at', 'INTEGER');
addColumnIfMissing('notes', 'locked', 'INTEGER NOT NULL DEFAULT 0');
addColumnIfMissing('notes', 'checklist', 'TEXT');

// Messages: reply_to, deleted, reactions (storage only this round).
addColumnIfMissing('messages', 'reply_to', 'TEXT');
addColumnIfMissing('messages', 'deleted', 'INTEGER NOT NULL DEFAULT 0');
addColumnIfMissing('messages', 'reactions', 'TEXT');

// ---------------------------------------------------------------------------
// Row mappers (snake_case DB -> camelCase API shapes)
// ---------------------------------------------------------------------------
function mapUser(row) {
  if (!row) return null;
  return {
    id: row.id,
    displayName: row.display_name,
    createdAt: row.created_at,
    lastSeenAt: row.last_seen_at,
  };
}

function mapConversation(row) {
  if (!row) return null;
  return {
    id: row.id,
    userA: row.user_a,
    userB: row.user_b,
    createdAt: row.created_at,
  };
}

function parseJson(value, fallback) {
  if (value == null) return fallback;
  try {
    return JSON.parse(value);
  } catch (_) {
    return fallback;
  }
}

function mapMessage(row) {
  if (!row) return null;
  return {
    id: row.id,
    conversationId: row.conversation_id,
    senderId: row.sender_id,
    body: row.body,
    status: row.status,
    createdAt: row.created_at,
    // Round-2 additive (storage only): defaults keep v1 payloads valid.
    replyTo: row.reply_to != null ? row.reply_to : null,
    deleted: row.deleted ? 1 : 0,
    reactions: parseJson(row.reactions, {}),
  };
}

function mapNote(row) {
  if (!row) return null;
  return {
    id: row.id,
    ownerId: row.owner_id,
    title: row.title,
    body: row.body,
    source: row.source,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    // Round-2 additive note fields (defaults applied for pre-existing rows).
    folder: row.folder != null ? row.folder : null,
    pinned: row.pinned ? 1 : 0,
    color: row.color != null ? row.color : null,
    reminderAt: row.reminder_at != null ? row.reminder_at : null,
    locked: row.locked ? 1 : 0,
    checklist: parseJson(row.checklist, null),
  };
}

function mapCall(row) {
  if (!row) return null;
  return {
    id: row.id,
    callerId: row.caller_id,
    calleeId: row.callee_id,
    type: row.type,
    status: row.status,
    startedAt: row.started_at,
    endedAt: row.ended_at,
    durationSec: row.duration_sec,
  };
}

// ---------------------------------------------------------------------------
// Users
// ---------------------------------------------------------------------------
const stmtInsertUser = db.prepare(
  `INSERT INTO users (id, display_name, created_at, last_seen_at)
   VALUES (@id, @displayName, @createdAt, @lastSeenAt)`
);
const stmtGetUser = db.prepare(`SELECT * FROM users WHERE id = ?`);
const stmtListUsers = db.prepare(`SELECT * FROM users ORDER BY display_name COLLATE NOCASE ASC`);
const stmtTouchUser = db.prepare(`UPDATE users SET last_seen_at = ? WHERE id = ?`);

function createUser(displayName) {
  const id = require('crypto').randomUUID();
  const ts = now();
  stmtInsertUser.run({ id, displayName, createdAt: ts, lastSeenAt: ts });
  return mapUser(stmtGetUser.get(id));
}

function getUser(id) {
  return mapUser(stmtGetUser.get(id));
}

function listUsers() {
  return stmtListUsers.all().map(mapUser);
}

function touchUser(id, ts = now()) {
  stmtTouchUser.run(ts, id);
}

// ---------------------------------------------------------------------------
// Conversations
// ---------------------------------------------------------------------------
const stmtGetConversation = db.prepare(`SELECT * FROM conversations WHERE id = ?`);
const stmtFindConversationByPair = db.prepare(
  `SELECT * FROM conversations WHERE user_a = ? AND user_b = ?`
);
const stmtInsertConversation = db.prepare(
  `INSERT INTO conversations (id, user_a, user_b, created_at) VALUES (?, ?, ?, ?)`
);

/** Get-or-create the unique 1:1 conversation for an unordered pair. */
function getOrCreateConversation(userId, peerId) {
  const [a, b] = [userId, peerId].sort();
  const existing = stmtFindConversationByPair.get(a, b);
  if (existing) {
    return { conversation: mapConversation(existing), created: false };
  }
  const id = require('crypto').randomUUID();
  stmtInsertConversation.run(id, a, b, now());
  return { conversation: mapConversation(stmtGetConversation.get(id)), created: true };
}

function getConversation(id) {
  return mapConversation(stmtGetConversation.get(id));
}

const stmtListConversationsForUser = db.prepare(
  `SELECT * FROM conversations WHERE user_a = ? OR user_b = ?`
);
const stmtLastMessage = db.prepare(
  `SELECT * FROM messages WHERE conversation_id = ? ORDER BY created_at DESC LIMIT 1`
);

/** List a user's conversations, most-recent-activity first, with peer + lastMessage. */
function listConversationsForUser(userId) {
  const rows = stmtListConversationsForUser.all(userId, userId);
  const result = rows.map((row) => {
    const conv = mapConversation(row);
    const peerId = conv.userA === userId ? conv.userB : conv.userA;
    const peer = getUser(peerId);
    const lastRow = stmtLastMessage.get(conv.id);
    const last = mapMessage(lastRow);
    return {
      id: conv.id,
      peer: peer
        ? { id: peer.id, displayName: peer.displayName }
        : { id: peerId, displayName: '(unknown)' },
      lastMessage: last
        ? { body: last.body, createdAt: last.createdAt, senderId: last.senderId }
        : null,
      createdAt: conv.createdAt,
    };
  });
  // Sort by last activity (last message createdAt, falling back to conv createdAt) desc.
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
const stmtInsertMessage = db.prepare(
  `INSERT INTO messages (id, conversation_id, sender_id, body, status, created_at)
   VALUES (@id, @conversationId, @senderId, @body, @status, @createdAt)`
);
const stmtGetMessage = db.prepare(`SELECT * FROM messages WHERE id = ?`);
const stmtUpdateMessageStatus = db.prepare(`UPDATE messages SET status = ? WHERE id = ?`);

function createMessage(conversationId, senderId, body, status = 'sent') {
  const id = require('crypto').randomUUID();
  const ts = now();
  stmtInsertMessage.run({ id, conversationId, senderId, body, status, createdAt: ts });
  return mapMessage(stmtGetMessage.get(id));
}

function getMessage(id) {
  return mapMessage(stmtGetMessage.get(id));
}

function setMessageStatus(id, status) {
  stmtUpdateMessageStatus.run(status, id);
  return getMessage(id);
}

const stmtListMessagesNewest = db.prepare(
  `SELECT * FROM messages WHERE conversation_id = ? ORDER BY created_at DESC LIMIT ?`
);
const stmtListMessagesBefore = db.prepare(
  `SELECT * FROM messages WHERE conversation_id = ? AND created_at < ? ORDER BY created_at DESC LIMIT ?`
);

/** Return messages ascending by created_at; default newest `limit`, optional `before` cursor. */
function listMessages(conversationId, limit = 50, before = null) {
  const rows = before == null
    ? stmtListMessagesNewest.all(conversationId, limit)
    : stmtListMessagesBefore.all(conversationId, before, limit);
  return rows.map(mapMessage).reverse(); // ascending
}

/** All messages of a conversation in ascending order (used by the AI summarizer). */
const stmtAllMessagesAsc = db.prepare(
  `SELECT * FROM messages WHERE conversation_id = ? ORDER BY created_at ASC`
);
function listAllMessages(conversationId) {
  return stmtAllMessagesAsc.all(conversationId).map(mapMessage);
}

/** Latest message in a conversation NOT sent by the given user (for smart-reply). */
const stmtLatestIncoming = db.prepare(
  `SELECT * FROM messages WHERE conversation_id = ? AND sender_id != ?
   ORDER BY created_at DESC LIMIT 1`
);
function getLatestIncomingMessage(conversationId, userId) {
  return mapMessage(stmtLatestIncoming.get(conversationId, userId));
}

/** Mark unread incoming messages (not sent by userId) as read; return affected ids + sender. */
const stmtUnreadIncoming = db.prepare(
  `SELECT * FROM messages WHERE conversation_id = ? AND sender_id != ? AND status != 'read'`
);
function markConversationRead(conversationId, userId) {
  const rows = stmtUnreadIncoming.all(conversationId, userId);
  db.exec('BEGIN');
  try {
    for (const r of rows) stmtUpdateMessageStatus.run('read', r.id);
    db.exec('COMMIT');
  } catch (e) {
    db.exec('ROLLBACK');
    throw e;
  }
  return rows.map(mapMessage);
}

// ---------------------------------------------------------------------------
// Notes
// ---------------------------------------------------------------------------
const stmtInsertNote = db.prepare(
  `INSERT INTO notes
     (id, owner_id, title, body, source, created_at, updated_at,
      folder, pinned, color, reminder_at, locked, checklist)
   VALUES
     (@id, @ownerId, @title, @body, @source, @createdAt, @updatedAt,
      @folder, @pinned, @color, @reminderAt, @locked, @checklist)`
);
const stmtGetNote = db.prepare(`SELECT * FROM notes WHERE id = ?`);
const stmtListNotes = db.prepare(
  `SELECT * FROM notes WHERE owner_id = ? ORDER BY pinned DESC, updated_at DESC`
);
const stmtUpdateNote = db.prepare(
  `UPDATE notes
      SET title = @title, body = @body, folder = @folder, pinned = @pinned,
          color = @color, reminder_at = @reminderAt, locked = @locked,
          checklist = @checklist, updated_at = @updatedAt
    WHERE id = @id`
);
const stmtDeleteNote = db.prepare(`DELETE FROM notes WHERE id = ?`);

// Normalize a checklist value (array | JSON string | null) to a JSON string or null.
function normalizeChecklist(value) {
  if (value == null) return null;
  if (typeof value === 'string') {
    // Accept a pre-stringified JSON array; otherwise store as-is is invalid, drop.
    const parsed = parseJson(value, undefined);
    return Array.isArray(parsed) ? JSON.stringify(parsed) : null;
  }
  if (Array.isArray(value)) return JSON.stringify(value);
  return null;
}

function createNote({
  ownerId, title, body, source = 'manual',
  folder = null, pinned = 0, color = null, reminderAt = null, locked = 0, checklist = null,
}) {
  const id = require('crypto').randomUUID();
  const ts = now();
  stmtInsertNote.run({
    id, ownerId, title, body, source, createdAt: ts, updatedAt: ts,
    folder: folder != null ? String(folder) : null,
    pinned: pinned ? 1 : 0,
    color: color != null ? String(color) : null,
    reminderAt: reminderAt != null ? Number(reminderAt) : null,
    locked: locked ? 1 : 0,
    checklist: normalizeChecklist(checklist),
  });
  return mapNote(stmtGetNote.get(id));
}

function getNote(id) {
  return mapNote(stmtGetNote.get(id));
}

function listNotes(ownerId) {
  return stmtListNotes.all(ownerId).map(mapNote);
}

function updateNote(id, fields) {
  const existing = getNote(id);
  if (!existing) return null;
  const f = fields || {};
  const pick = (key, current) => (f[key] !== undefined ? f[key] : current);
  const newTitle = pick('title', existing.title);
  const newBody = pick('body', existing.body);
  const newFolder = pick('folder', existing.folder);
  const newPinned = f.pinned !== undefined ? (f.pinned ? 1 : 0) : existing.pinned;
  const newColor = pick('color', existing.color);
  const newReminder = f.reminderAt !== undefined
    ? (f.reminderAt != null ? Number(f.reminderAt) : null)
    : existing.reminderAt;
  const newLocked = f.locked !== undefined ? (f.locked ? 1 : 0) : existing.locked;
  const newChecklist = f.checklist !== undefined
    ? normalizeChecklist(f.checklist)
    : (existing.checklist != null ? JSON.stringify(existing.checklist) : null);
  stmtUpdateNote.run({
    id,
    title: newTitle,
    body: newBody,
    folder: newFolder != null ? String(newFolder) : null,
    pinned: newPinned ? 1 : 0,
    color: newColor != null ? String(newColor) : null,
    reminderAt: newReminder != null ? Number(newReminder) : null,
    locked: newLocked ? 1 : 0,
    checklist: newChecklist,
    updatedAt: now(),
  });
  return getNote(id);
}

function deleteNote(id) {
  const info = stmtDeleteNote.run(id);
  return info.changes > 0;
}

// ---------------------------------------------------------------------------
// Call logs
// ---------------------------------------------------------------------------
const stmtInsertCall = db.prepare(
  `INSERT INTO call_logs (id, caller_id, callee_id, type, status, started_at, ended_at, duration_sec)
   VALUES (@id, @callerId, @calleeId, @type, @status, @startedAt, @endedAt, @durationSec)`
);
const stmtGetCall = db.prepare(`SELECT * FROM call_logs WHERE id = ?`);
const stmtUpdateCall = db.prepare(
  `UPDATE call_logs SET status = ?, ended_at = ?, duration_sec = ? WHERE id = ?`
);
const stmtListCalls = db.prepare(
  `SELECT * FROM call_logs WHERE caller_id = ? OR callee_id = ? ORDER BY started_at DESC`
);

function computeDuration(status, startedAt, endedAt) {
  if (status === 'missed' || status === 'declined') return 0;
  if (startedAt != null && endedAt != null) {
    return Math.max(0, Math.round((endedAt - startedAt) / 1000));
  }
  return null;
}

function createCall({ callerId, calleeId, type, status, startedAt, endedAt }) {
  const id = require('crypto').randomUUID();
  const start = startedAt != null ? startedAt : now();
  const durationSec = computeDuration(status, start, endedAt ?? null);
  stmtInsertCall.run({
    id,
    callerId,
    calleeId,
    type,
    status,
    startedAt: start,
    endedAt: endedAt ?? null,
    durationSec,
  });
  return mapCall(stmtGetCall.get(id));
}

function updateCall(id, { status, endedAt }) {
  const existing = mapCall(stmtGetCall.get(id));
  if (!existing) return null;
  const newStatus = status !== undefined ? status : existing.status;
  const newEnded = endedAt !== undefined ? endedAt : existing.endedAt;
  const durationSec = computeDuration(newStatus, existing.startedAt, newEnded);
  stmtUpdateCall.run(newStatus, newEnded, durationSec, id);
  return mapCall(stmtGetCall.get(id));
}

function getCall(id) {
  return mapCall(stmtGetCall.get(id));
}

function listCalls(userId) {
  return stmtListCalls.all(userId, userId).map(mapCall);
}

// ---------------------------------------------------------------------------
// Auth — users with credentials
// ---------------------------------------------------------------------------
const stmtInsertUserWithAuth = db.prepare(
  `INSERT INTO users (id, display_name, username, password_hash, created_at, last_seen_at)
   VALUES (@id, @displayName, @username, @passwordHash, @createdAt, @lastSeenAt)`
);
const stmtGetUserByUsername = db.prepare(`SELECT * FROM users WHERE username = ?`);

function createUserWithAuth(username, displayName, passwordHash) {
  const id = require('crypto').randomUUID();
  const ts = now();
  stmtInsertUserWithAuth.run({ id, displayName: displayName || username, username, passwordHash, createdAt: ts, lastSeenAt: ts });
  return mapUser(stmtGetUser.get(id));
}

function getUserByUsername(username) {
  const row = stmtGetUserByUsername.get(username);
  if (!row) return null;
  return { ...mapUser(row), username: row.username, passwordHash: row.password_hash };
}

// ---------------------------------------------------------------------------
// Sessions
// ---------------------------------------------------------------------------
const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30 days

const stmtInsertSession = db.prepare(
  `INSERT INTO sessions (token, user_id, created_at, expires_at) VALUES (?, ?, ?, ?)`
);
const stmtGetSession = db.prepare(`SELECT * FROM sessions WHERE token = ?`);
const stmtDeleteSession = db.prepare(`DELETE FROM sessions WHERE token = ?`);
const stmtDeleteExpiredSessions = db.prepare(`DELETE FROM sessions WHERE expires_at < ?`);

function createSession(userId) {
  const token = require('crypto').randomUUID();
  const ts = now();
  stmtDeleteExpiredSessions.run(ts); // prune on every new session (cheap housekeeping)
  stmtInsertSession.run(token, userId, ts, ts + SESSION_TTL_MS);
  return token;
}

function getSession(token) {
  if (!token) return null;
  const row = stmtGetSession.get(token);
  if (!row) return null;
  if (row.expires_at < now()) { stmtDeleteSession.run(token); return null; }
  return { token: row.token, userId: row.user_id, createdAt: row.created_at, expiresAt: row.expires_at };
}

function deleteSession(token) {
  if (token) stmtDeleteSession.run(token);
}

// ---------------------------------------------------------------------------
// Groups (Round-2, minimal: storage + listing only)
// ---------------------------------------------------------------------------
const stmtInsertGroup = db.prepare(
  `INSERT INTO groups (id, name, owner_id, created_at) VALUES (?, ?, ?, ?)`
);
const stmtGetGroup = db.prepare(`SELECT * FROM groups WHERE id = ?`);
const stmtInsertGroupMember = db.prepare(
  `INSERT OR IGNORE INTO group_members (group_id, user_id, joined_at) VALUES (?, ?, ?)`
);
const stmtGroupMemberIds = db.prepare(
  `SELECT user_id FROM group_members WHERE group_id = ? ORDER BY joined_at ASC`
);
const stmtGroupsForUser = db.prepare(
  `SELECT DISTINCT g.* FROM groups g
     JOIN group_members gm ON gm.group_id = g.id
    WHERE gm.user_id = ?
    ORDER BY g.created_at DESC`
);

function mapGroup(row) {
  if (!row) return null;
  return {
    id: row.id,
    name: row.name,
    ownerId: row.owner_id,
    memberIds: stmtGroupMemberIds.all(row.id).map((r) => r.user_id),
    createdAt: row.created_at,
  };
}

function createGroup({ ownerId, name, memberIds = [] }) {
  const id = require('crypto').randomUUID();
  const ts = now();
  // Owner is always a member; de-dupe.
  const members = [...new Set([ownerId, ...memberIds])];
  db.exec('BEGIN');
  try {
    stmtInsertGroup.run(id, name, ownerId, ts);
    for (const uid of members) stmtInsertGroupMember.run(id, uid, ts);
    db.exec('COMMIT');
  } catch (e) {
    db.exec('ROLLBACK');
    throw e;
  }
  return mapGroup(stmtGetGroup.get(id));
}

function getGroup(id) {
  return mapGroup(stmtGetGroup.get(id));
}

function listGroupsForUser(userId) {
  return stmtGroupsForUser.all(userId).map(mapGroup);
}

module.exports = {
  db,
  now,
  DB_PATH,
  // users
  createUser,
  getUser,
  listUsers,
  touchUser,
  // conversations
  getOrCreateConversation,
  getConversation,
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
