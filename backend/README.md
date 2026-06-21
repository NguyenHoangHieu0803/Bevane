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

## Deployment: tunnel / wss readiness (Round 3)

The app is served over HTTPS at **https://bevane.loca.lt** via localtunnel
(`localtunnel --port <PORT> --subdomain bevane`) pointing at the running Node
server. Verified Round-3 facts:

- **Origin-agnostic.** The server binds `0.0.0.0`, respects `process.env.PORT`,
  and hardcodes **no** host/origin anywhere. The client uses relative `/api/...`
  and derives the socket URL from `location` (`wss://<host>/ws`).
- **Same-origin → no CORS.** `/`, `/api/*`, and `/ws` are all served by this one
  process from the same origin, so **no CORS is configured** (none needed). Do
  not add CORS unless a genuine cross-origin need appears.
- **WS through the proxy.** The `ws` server attaches to the **same HTTP server**
  at `path: '/ws'` and performs **no Origin allow-listing / no `verifyClient`**,
  so the `Upgrade` handshake passes through the tunnel. Verified by connecting
  with `Origin: https://bevane.loca.lt` + `X-Forwarded-Proto: https` — the
  upgrade succeeds.
- **No forced proto.** Nothing reads `req.secure`/`req.protocol`/`req.ip` or
  forces `http`/`ws`. TLS terminates at the tunnel; the Node server stays HTTP/WS
  behind it. `app.set('trust proxy', …)` is therefore **not needed** and is not
  set.
- **No iOS-specific server logic.** No `apple-*` headers, no user-agent / Safari
  branching, no iOS-only WebRTC handling (signaling is a dumb relay). Confirmed
  by grep — none found.

## Persistence guarantee (Round 3, verified)

**All conversations and user data are persisted in SQLite and survive a server
restart, a browser reload, and a WS reconnect.**

- **Where:** `data/bevane.db` (override with `BEVANE_DB`), `better-sqlite3` in
  **WAL** mode (`bevane.db-wal` + `bevane.db-shm` alongside it).
- **What persists (tables):** `users`, `conversations`, `messages`, `notes`,
  `call_logs`, `groups`, `group_members`. Re-listed via:
  `GET /api/conversations?userId=`, `GET /api/conversations/:id/messages`,
  `GET /api/notes?ownerId=`, `GET /api/calls?userId=`.
- **Durable without a clean shutdown.** WAL journaling is durable: data survives
  even a hard `SIGKILL` (no explicit checkpoint required). Verified by killing
  the process with `kill -9` and re-listing from a fresh process on the same DB
  file — identical rows returned.
- **Only `online` presence is in-memory** (the WS-connected set), and it is
  *correctly* derived live on each request — it is not lost data. Nothing the UI
  depends on after reload is held only in memory.

Verification evidence (3 messages / 1 conversation / 1 note / 1 completed call,
before vs. after a `kill -9` restart on the same DB file):

```
                BEFORE          AFTER (new process)
conversations   1               1
messages        3  (same order) 3  (same order/content)
notes           1               1
call_logs       1  (dur 45s)    1  (dur 45s)
```

The WS smoke test (`node tests/ws_smoke.js`) passes all 21 assertions
(auth → auth:ok, chat round-trip + delivered/read receipts, typing, full WebRTC
relay) — the same path used over `wss` through the tunnel.

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
