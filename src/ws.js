'use strict';

const { WebSocketServer } = require('ws');
const db = require('./db');

/** userId -> ws socket */
const clients = new Map();

function isOnline(userId) { return clients.has(userId); }

function send(ws, obj) {
  if (ws && ws.readyState === ws.OPEN) ws.send(JSON.stringify(obj));
}

function sendToUser(userId, obj) {
  const sock = clients.get(userId);
  if (sock && sock.readyState === sock.OPEN) { sock.send(JSON.stringify(obj)); return true; }
  return false;
}

function broadcast(obj) {
  const data = JSON.stringify(obj);
  for (const sock of clients.values()) {
    if (sock.readyState === sock.OPEN) sock.send(data);
  }
}

function sendError(ws, code, message) { send(ws, { type: 'error', code, message }); }

async function peerOf(conversationId, userId) {
  const conv = await db.getConversation(conversationId);
  if (!conv) return null;
  return conv.userA === userId ? conv.userB : conv.userA;
}

function attachWebSocketServer(httpServer) {
  const wss = new WebSocketServer({ server: httpServer, path: '/ws' });

  const heartbeat = setInterval(() => {
    for (const ws of wss.clients) {
      if (ws.isAlive === false) { ws.terminate(); continue; }
      ws.isAlive = false;
      try { ws.ping(); } catch (_) { /* noop */ }
    }
  }, 30000);
  wss.on('close', () => clearInterval(heartbeat));

  wss.on('connection', (ws) => {
    ws.isAlive = true;
    ws.userId  = null;
    ws.on('pong', () => { ws.isAlive = true; });

    ws.on('message', async (raw) => {
      let frame;
      try { frame = JSON.parse(raw.toString()); } catch (_) {
        return sendError(ws, 'bad_json', 'Frame is not valid JSON.');
      }
      if (!frame || typeof frame.type !== 'string')
        return sendError(ws, 'bad_frame', 'Frame must have a string "type".');
      try { await handleFrame(ws, frame); } catch (e) {
        console.error('[ws] handleFrame error', e);
        sendError(ws, 'server_error', 'Internal error.');
      }
    });

    ws.on('close', async () => {
      const userId = ws.userId;
      if (userId && clients.get(userId) === ws) {
        clients.delete(userId);
        try { await db.touchUser(userId); } catch { /* noop */ }
        broadcast({ type: 'presence', userId, online: false });
      }
    });

    ws.on('error', () => { /* swallow; close handler cleans up */ });
  });

  async function handleFrame(ws, frame) {
    const { type } = frame;

    // ---- Auth ----
    if (type === 'auth') {
      const { userId, token } = frame;
      const user = userId && await db.getUser(userId);
      if (!user) return sendError(ws, 'auth_failed', 'Unknown userId.');
      const session = await db.getSession(token);
      if (!session || session.userId !== userId)
        return sendError(ws, 'auth_failed', 'Session token is invalid or expired. Please log in again.');
      const prev = clients.get(userId);
      if (prev && prev !== ws) {
        send(prev, { type: 'error', code: 'replaced', message: 'Session replaced by a new connection.' });
        try { prev.close(); } catch (_) { /* noop */ }
      }
      ws.userId = userId;
      clients.set(userId, ws);
      await db.touchUser(userId);
      send(ws, { type: 'auth:ok', userId });
      broadcast({ type: 'presence', userId, online: true });
      return;
    }

    if (!ws.userId) return sendError(ws, 'not_authed', 'Send an "auth" frame first.');

    switch (type) {
      // ---- Chat ----
      case 'chat:send': {
        const { conversationId, senderId, body, clientTempId } = frame;
        if (!conversationId || !await db.getConversation(conversationId))
          return sendError(ws, 'no_conversation', 'Unknown conversationId.');
        if (!body || !body.trim())
          return sendError(ws, 'empty_body', 'Message body is empty.');
        const sender  = senderId || ws.userId;
        const peerId  = await peerOf(conversationId, sender);
        const msg     = await db.createMessage(conversationId, sender, body.trim(), 'sent');
        send(ws, { type: 'chat:new', message: msg, clientTempId });
        const delivered = sendToUser(peerId, { type: 'chat:new', message: msg });
        if (delivered) {
          const updated = await db.setMessageStatus(msg.id, 'delivered');
          send(ws, { type: 'chat:status', messageId: updated.id, status: 'delivered' });
        }
        return;
      }

      case 'chat:read': {
        const { conversationId, userId } = frame;
        if (!conversationId || !await db.getConversation(conversationId))
          return sendError(ws, 'no_conversation', 'Unknown conversationId.');
        const reader  = userId || ws.userId;
        const updated = await db.markConversationRead(conversationId, reader);
        for (const m of updated) sendToUser(m.senderId, { type: 'chat:status', messageId: m.id, status: 'read' });
        return;
      }

      // ---- Typing ----
      case 'typing': {
        const { conversationId, userId, isTyping } = frame;
        if (!conversationId) return;
        const sender = userId || ws.userId;
        const peerId = await peerOf(conversationId, sender);
        if (peerId) sendToUser(peerId, { type: 'typing', conversationId, userId: sender, isTyping: !!isTyping });
        return;
      }

      // ---- WebRTC signaling relay ----
      case 'call:invite': {
        const { callId, from, to, callType } = frame;
        const fromUser = await db.getUser(from || ws.userId);
        const fromName = fromUser ? fromUser.displayName : 'Someone';
        const ok = sendToUser(to, { type: 'call:incoming', callId, from: from || ws.userId, fromName, callType });
        if (!ok) send(ws, { type: 'call:unavailable', callId, to });
        return;
      }

      case 'call:accept':
      case 'call:decline':
      case 'call:cancel':
      case 'call:end':
      case 'webrtc:offer':
      case 'webrtc:answer':
      case 'webrtc:ice': {
        const to = frame.to;
        if (!to) return sendError(ws, 'no_target', 'Missing "to" field.');
        const fromUser = await db.getUser(frame.from || ws.userId);
        const out = { ...frame };
        if (fromUser && !out.fromName) out.fromName = fromUser.displayName;
        const ok = sendToUser(to, out);
        if (!ok && (type === 'call:accept' || type === 'webrtc:offer'))
          send(ws, { type: 'call:unavailable', callId: frame.callId, to });
        return;
      }

      case 'ping':
        send(ws, { type: 'pong' });
        return;

      default:
        return sendError(ws, 'unknown_type', `Unknown frame type: ${type}`);
    }
  }

  return wss;
}

module.exports = { attachWebSocketServer, clients, isOnline, broadcast, sendToUser };
