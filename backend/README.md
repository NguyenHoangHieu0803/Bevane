# Bevane Backend

Single Node.js process serving the REST API (`/api`), the WebSocket
chat/signaling channel (`/ws`), and the static PWA frontend (`/public`),
all same-origin.

## Run

```bash
npm install
npm start          # node server.js
```

- **Port:** `process.env.PORT || 3000`, bound to `0.0.0.0`.
- **DB:** `better-sqlite3` at `data/bevane.db` (override with `BEVANE_DB`).
  The data dir and all tables are created on boot, idempotently. WAL mode on.
- **Frontend:** drop files into `public/` — the server serves them. A
  placeholder `public/index.html` ships so the server boots standalone.
  Unknown non-`/api` GET routes fall back to `public/index.html` (SPA shell).

## Stack

Express + `ws` + `better-sqlite3` + `uuid`. CommonJS modules.

- `server.js` — Express app, HTTP server, all REST endpoints, static serving.
- `src/db.js` — SQLite setup, schema, query helpers.
- `src/ws.js` — WebSocket: auth, presence, chat, typing, read receipts, WebRTC relay.
- `src/ai.js` — deterministic offline AI (note summarizer + smart replies).

## API

See `backend/api_specs.md` for the full REST + WebSocket contract (the source
of truth the frontend codes against).

## Call-log approach

Call logs are written via **REST `POST /api/calls`** at end-of-call (with an
optional `PATCH /api/calls/:id` to finalize). The frontend owns call duration
timing. The WebSocket layer is a pure signaling relay and does **not**
auto-write call logs. `durationSec` is computed server-side from
`startedAt`→`endedAt` (0 for missed/declined).

## AI

Fully local and deterministic — **no network, no API key**. Same input always
yields the same output for reproducible demos/QA.

- `POST /api/ai/generate-note` — summarizes a conversation's messages into a
  persisted `source:"ai"` note with `summary` + `actionItems`.
- `POST /api/ai/smart-reply` — 2–4 short reply suggestions to the latest
  message not sent by the requesting user.

## WebRTC / STUN

The server only relays signaling (offer/answer/ICE); media flows peer-to-peer.
No TURN. The frontend should configure a public STUN server in its
`RTCPeerConnection`, e.g.:

```js
new RTCPeerConnection({ iceServers: [{ urls: 'stun:stun.l.google.com:19302' }] });
```

Per the requirements (Non-Goals §6), TURN/NAT traversal beyond a public STUN
server is out of scope for the demo.
