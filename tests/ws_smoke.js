'use strict';

/**
 * Bevane — WebSocket / real-time smoke test.
 *
 * Opens two authenticated WS clients (Alice + Bob) against a running server
 * (default http://localhost:3000) and verifies the real-time contract:
 *   1. auth -> auth:ok + presence broadcast
 *   2. chat:send -> chat:new relayed to BOTH parties (sender keeps clientTempId)
 *   3. delivered status to sender when recipient online
 *   4. chat:read -> chat:status read back to original sender
 *   5. typing relay to peer
 *   6. WebRTC signaling: call:invite -> call:incoming (with fromName)
 *   7. webrtc:offer relayed verbatim (sdp preserved)
 *   8. call:invite to an offline target -> call:unavailable to caller
 *
 * Exits 0 if every assertion passes, 1 otherwise. Requires the `ws` package.
 *
 * Usage:  node tests/ws_smoke.js            (server must already be running)
 */

const WebSocket = require('ws');
const http = require('http');

const BASE = process.env.BASE || 'http://localhost:3000';
const WS_URL = BASE.replace(/^http/, 'ws') + '/ws';

let pass = 0;
let fail = 0;
const results = [];
function check(name, cond, detail) {
  if (cond) {
    pass++;
    results.push(`  PASS  ${name}`);
  } else {
    fail++;
    results.push(`  FAIL  ${name}${detail ? '  — ' + detail : ''}`);
  }
}

// --- tiny REST helper (no deps) ---
function rest(method, path, body) {
  return new Promise((resolve, reject) => {
    const data = body ? JSON.stringify(body) : null;
    const u = new URL(BASE + path);
    const req = http.request(
      {
        method,
        hostname: u.hostname,
        port: u.port,
        path: u.pathname + u.search,
        headers: { 'Content-Type': 'application/json' },
      },
      (res) => {
        let buf = '';
        res.on('data', (c) => (buf += c));
        res.on('end', () => {
          try {
            resolve({ status: res.statusCode, body: buf ? JSON.parse(buf) : null });
          } catch (e) {
            resolve({ status: res.statusCode, body: buf });
          }
        });
      }
    );
    req.on('error', reject);
    if (data) req.write(data);
    req.end();
  });
}

function open(url) {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(url);
    ws._inbox = [];
    ws.on('message', (raw) => {
      try {
        ws._inbox.push(JSON.parse(raw.toString()));
      } catch (_) {
        /* ignore */
      }
    });
    ws.on('open', () => resolve(ws));
    ws.on('error', reject);
  });
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// Wait until a frame matching predicate arrives in ws._inbox (or timeout).
async function waitFor(ws, pred, timeout = 1500) {
  const start = Date.now();
  while (Date.now() - start < timeout) {
    const hit = ws._inbox.find(pred);
    if (hit) return hit;
    await sleep(25);
  }
  return null;
}

function send(ws, obj) {
  ws.send(JSON.stringify(obj));
}

(async () => {
  // 1. Register two fresh users + a conversation.
  const a = (await rest('POST', '/api/users', { displayName: 'WSAlice' })).body;
  const b = (await rest('POST', '/api/users', { displayName: 'WSBob' })).body;
  const conv = (await rest('POST', '/api/conversations', { userId: a.id, peerId: b.id })).body;
  check('setup: users + conversation created', a.id && b.id && conv.id);

  // 2. Open + auth both sockets.
  const alice = await open(WS_URL);
  const bob = await open(WS_URL);

  send(alice, { type: 'auth', userId: a.id });
  send(bob, { type: 'auth', userId: b.id });

  const aliceOk = await waitFor(alice, (f) => f.type === 'auth:ok' && f.userId === a.id);
  const bobOk = await waitFor(bob, (f) => f.type === 'auth:ok' && f.userId === b.id);
  check('auth -> auth:ok (Alice)', !!aliceOk);
  check('auth -> auth:ok (Bob)', !!bobOk);

  // 3. presence broadcast: Alice should have seen Bob come online (or her own).
  const presence = await waitFor(alice, (f) => f.type === 'presence' && f.online === true);
  check('presence broadcast on connect', !!presence, 'no presence frame received');

  // 4. chat:send -> chat:new to BOTH; sender keeps clientTempId; delivered status.
  const tempId = 'tmp-123';
  send(alice, {
    type: 'chat:send',
    conversationId: conv.id,
    senderId: a.id,
    body: 'Hello Bob in real time',
    clientTempId: tempId,
  });

  const aliceEcho = await waitFor(alice, (f) => f.type === 'chat:new' && f.clientTempId === tempId);
  check('chat:send -> chat:new echo to sender with clientTempId', !!aliceEcho);
  check(
    'echoed message has correct body + status',
    aliceEcho && aliceEcho.message && aliceEcho.message.body === 'Hello Bob in real time'
  );

  const bobRecv = await waitFor(
    bob,
    (f) => f.type === 'chat:new' && f.message && f.message.body === 'Hello Bob in real time'
  );
  check('chat:new relayed to recipient (Bob)', !!bobRecv);
  check('recipient copy has NO clientTempId', bobRecv && bobRecv.clientTempId === undefined);

  const deliveredStatus = await waitFor(
    alice,
    (f) => f.type === 'chat:status' && f.status === 'delivered'
  );
  check('sender receives chat:status delivered (recipient online)', !!deliveredStatus);

  const msgId = aliceEcho && aliceEcho.message && aliceEcho.message.id;

  // 5. chat:read -> chat:status read back to original sender (Alice).
  send(bob, { type: 'chat:read', conversationId: conv.id, userId: b.id });
  const readStatus = await waitFor(
    alice,
    (f) => f.type === 'chat:status' && f.status === 'read' && f.messageId === msgId
  );
  check('chat:read -> chat:status read to original sender', !!readStatus);

  // 6. typing relay (Alice -> Bob).
  send(alice, { type: 'typing', conversationId: conv.id, userId: a.id, isTyping: true });
  const typing = await waitFor(
    bob,
    (f) => f.type === 'typing' && f.userId === a.id && f.isTyping === true
  );
  check('typing relayed to peer', !!typing);

  // 7. WebRTC: call:invite (Alice -> Bob) -> call:incoming with fromName.
  const callId = 'call-abc';
  send(alice, { type: 'call:invite', callId, from: a.id, to: b.id, callType: 'video' });
  const incoming = await waitFor(
    bob,
    (f) => f.type === 'call:incoming' && f.callId === callId
  );
  check('call:invite -> call:incoming (callee)', !!incoming);
  check('call:incoming includes fromName', incoming && incoming.fromName === 'WSAlice');
  check('call:incoming preserves callType', incoming && incoming.callType === 'video');

  // 8. webrtc:offer relayed verbatim (sdp preserved).
  const sdp = { type: 'offer', sdp: 'v=0\r\no=- 42 2 IN IP4 127.0.0.1...' };
  send(alice, { type: 'webrtc:offer', callId, from: a.id, to: b.id, sdp });
  const offer = await waitFor(bob, (f) => f.type === 'webrtc:offer' && f.callId === callId);
  check('webrtc:offer relayed to peer', !!offer);
  check(
    'webrtc:offer sdp preserved verbatim',
    offer && JSON.stringify(offer.sdp) === JSON.stringify(sdp)
  );

  // 9. webrtc:answer + ice relay (Bob -> Alice).
  send(bob, { type: 'webrtc:answer', callId, from: b.id, to: a.id, sdp: { type: 'answer' } });
  const answer = await waitFor(alice, (f) => f.type === 'webrtc:answer' && f.callId === callId);
  check('webrtc:answer relayed back to caller', !!answer);

  send(bob, { type: 'webrtc:ice', callId, from: b.id, to: a.id, candidate: { candidate: 'x' } });
  const ice = await waitFor(alice, (f) => f.type === 'webrtc:ice' && f.callId === callId);
  check('webrtc:ice relayed', !!ice);

  // 10. call:invite to an OFFLINE target -> call:unavailable to caller.
  const carl = (await rest('POST', '/api/users', { displayName: 'WSCarl' })).body; // never connects
  send(alice, { type: 'call:invite', callId: 'c2', from: a.id, to: carl.id, callType: 'voice' });
  const unavail = await waitFor(
    alice,
    (f) => f.type === 'call:unavailable' && f.callId === 'c2'
  );
  check('call:invite to offline target -> call:unavailable', !!unavail);

  // 11. not-authed frame rejected.
  const stranger = await open(WS_URL);
  send(stranger, { type: 'chat:send', conversationId: conv.id, body: 'x' });
  const notAuthed = await waitFor(stranger, (f) => f.type === 'error' && f.code === 'not_authed');
  check('unauthed frame rejected with error not_authed', !!notAuthed);
  stranger.close();

  // 12. unknown frame type -> error.
  send(bob, { type: 'totally:unknown' });
  const unknown = await waitFor(bob, (f) => f.type === 'error' && f.code === 'unknown_type');
  check('unknown frame type -> error unknown_type', !!unknown);

  alice.close();
  bob.close();

  console.log('\n=== WebSocket smoke test results ===');
  console.log(results.join('\n'));
  console.log(`\n${pass} passed, ${fail} failed`);
  await sleep(100);
  process.exit(fail === 0 ? 0 : 1);
})().catch((e) => {
  console.error('WS smoke test crashed:', e);
  process.exit(1);
});
