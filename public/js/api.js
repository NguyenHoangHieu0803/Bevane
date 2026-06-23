// REST client. Same-origin: fetch('/api/...'). Throws ApiError on non-2xx.

import { state } from './state.js';

export class ApiError extends Error {
  constructor(status, code, message) {
    super(message || code || `HTTP ${status}`);
    this.status = status;
    this.code = code;
  }
}

async function request(method, path, body) {
  const opts = { method, headers: {} };
  if (body !== undefined) {
    opts.headers['Content-Type'] = 'application/json';
    opts.body = JSON.stringify(body);
  }
  if (state.token) {
    opts.headers['Authorization'] = `Bearer ${state.token}`;
  }
  const res = await fetch(path, opts);
  if (res.status === 204) return null;
  let data = null;
  const text = await res.text();
  if (text) {
    try { data = JSON.parse(text); } catch { data = text; }
  }
  if (!res.ok) {
    const code = data && data.error;
    const msg = (data && data.message) || `Request failed (${res.status})`;
    throw new ApiError(res.status, code, msg);
  }
  return data;
}

export const api = {
  // Auth
  register: (username, password, displayName) => request('POST', '/api/auth/register', { username, password, displayName }),
  login:    (username, password) => request('POST', '/api/auth/login',    { username, password }),
  logout:   ()                   => request('POST', '/api/auth/logout'),
  me:             ()                              => request('GET',   '/api/auth/me'),
  updateProfile:  (displayName, avatarUrl, wallpaperUrl) => request('PATCH', '/api/profile', { displayName, avatarUrl, wallpaperUrl }),
  changePassword: (currentPassword, newPassword)  => request('POST',  '/api/auth/change-password', { currentPassword, newPassword }),

  // Users
  createUser: (displayName) => request('POST', '/api/users', { displayName }),
  listUsers: (excludeId) =>
    request('GET', `/api/users${excludeId ? `?excludeId=${encodeURIComponent(excludeId)}` : ''}`),
  getUser: (id) => request('GET', `/api/users/${encodeURIComponent(id)}`),

  // Conversations & messages
  openConversation: (userId, peerId) =>
    request('POST', '/api/conversations', { userId, peerId }),
  listConversations: (userId) =>
    request('GET', `/api/conversations?userId=${encodeURIComponent(userId)}`),
  listMessages: (conversationId, { limit = 50, before } = {}) => {
    const q = new URLSearchParams({ limit: String(limit) });
    if (before) q.set('before', String(before));
    return request('GET', `/api/conversations/${encodeURIComponent(conversationId)}/messages?${q}`);
  },

  // Notes — POST/PUT accept extended fields (folder, pinned, color, reminderAt, locked, checklist).
  listNotes: (ownerId) => request('GET', `/api/notes?ownerId=${encodeURIComponent(ownerId)}`),
  createNote: (ownerId, fields) => request('POST', '/api/notes', { ownerId, ...fields }),
  updateNote: (id, patch) => request('PUT', `/api/notes/${encodeURIComponent(id)}`, patch),
  deleteNote: (id) => request('DELETE', `/api/notes/${encodeURIComponent(id)}`),

  // Groups (create + list only)
  createGroup: (ownerId, name, memberIds) =>
    request('POST', '/api/groups', { ownerId, name, memberIds }),
  listGroups: (userId) => request('GET', `/api/groups?userId=${encodeURIComponent(userId)}`),

  // AI
  generateNote: (ownerId, conversationId) =>
    request('POST', '/api/ai/generate-note', { ownerId, conversationId }),
  smartReply: (conversationId, userId) =>
    request('POST', '/api/ai/smart-reply', { conversationId, userId }),
  toneAdjust: (text, tone) => request('POST', '/api/ai/tone-adjust', { text, tone }),
  translate: (text, targetLang) => request('POST', '/api/ai/translate', { text, targetLang }),
  chatSummary: (conversationId) => request('POST', '/api/ai/chat-summary', { conversationId }),
  noteSummarize: (payload) => request('POST', '/api/ai/note-summarize', payload),
  smartTags: (text) => request('POST', '/api/ai/smart-tags', { text }),
  actionItems: (text) => request('POST', '/api/ai/action-items', { text }),
  askAboutNote: (text, question) => request('POST', '/api/ai/ask-about-note', { text, question }),

  // Calls
  logCall: (payload) => request('POST', '/api/calls', payload),
  listCalls: (userId) => request('GET', `/api/calls?userId=${encodeURIComponent(userId)}`),
};
