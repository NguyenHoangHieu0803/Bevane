// WebSocket transport. Derives ws/wss from location, auto-authenticates,
// auto-reconnects, and re-emits typed frames via the shared event bus.

import { state, emit } from './state.js';

let socket = null;
let authed = false;
let reconnectTimer = null;
let reconnectDelay = 1000;
let keepAliveInterval = null;
const queue = []; // frames buffered until auth:ok

function wsUrl() {
  const proto = location.protocol === 'https:' ? 'wss' : 'ws';
  return `${proto}://${location.host}/ws`;
}

export function isAuthed() { return authed; }

export function connect() {
  if (!state.userId) return;
  if (socket && (socket.readyState === WebSocket.OPEN || socket.readyState === WebSocket.CONNECTING)) {
    return;
  }
  socket = new WebSocket(wsUrl());

  socket.onopen = () => {
    socket.send(JSON.stringify({ type: 'auth', userId: state.userId, token: state.token }));
  };

  socket.onmessage = (ev) => {
    let frame;
    try { frame = JSON.parse(ev.data); } catch { return; }
    if (!frame || !frame.type) return;

    if (frame.type === 'auth:ok') {
      authed = true;
      reconnectDelay = 1000;
      // Send a JSON ping every 25 s to keep the connection alive through
      // mobile-carrier NATs and reverse proxies that close idle WebSocket
      // connections (the symptom: recipient on phone stops receiving messages).
      clearInterval(keepAliveInterval);
      keepAliveInterval = setInterval(() => {
        if (socket && socket.readyState === WebSocket.OPEN) {
          socket.send(JSON.stringify({ type: 'ping' }));
        }
      }, 25000);
      // flush queued frames
      while (queue.length) socket.send(JSON.stringify(queue.shift()));
      emit('ws:ready', frame);
      return;
    }
    if (frame.type === 'pong') return; // keepalive echo, no UI action needed
    // Re-emit every frame under its own event name.
    emit(frame.type, frame);
  };

  socket.onclose = () => {
    clearInterval(keepAliveInterval);
    keepAliveInterval = null;
    authed = false;
    emit('ws:closed', {});
    scheduleReconnect();
  };

  socket.onerror = () => { /* swallow; close handler will reconnect */ };
}

function scheduleReconnect() {
  if (reconnectTimer) return;
  reconnectTimer = setTimeout(() => {
    reconnectTimer = null;
    reconnectDelay = Math.min(reconnectDelay * 1.5, 5000);
    connect();
  }, reconnectDelay);
}

// Send a frame; buffer until authenticated.
export function send(frame) {
  if (authed && socket && socket.readyState === WebSocket.OPEN) {
    socket.send(JSON.stringify(frame));
  } else {
    queue.push(frame);
    connect();
  }
}
