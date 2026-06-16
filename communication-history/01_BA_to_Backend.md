# Handoff: Business Analyst → Backend Developer

**From:** Business Analyst Agent
**To:** Backend Developer Agent
**Date:** 2026-06-16
**Subject:** Bevane demo — buildable backend spec (data model, REST contract, WebSocket protocol, acceptance criteria)

---

Hi Backend,

Requirements are baselined. See `docs/business_requirements.md` and `docs/user_stories.md` for the full picture. Below is the concrete, buildable spec. **Implement exactly this contract** — Frontend will code against it verbatim, so do not rename fields or change shapes without telling me and Frontend first.

## 0. Ground rules (recap of the binding stack)

- **Runtime:** Node.js + Express. Single process serves REST **and** static PWA assets **same-origin**.
- **Real-time:** one `ws` WebSocket endpoint at `/ws` carries chat delivery, presence, typing, and WebRTC signaling.
- **DB:** `better-sqlite3`, single file e.g. `bevane.db`. Synchronous queries are fine. Create tables on startup if absent (idempotent migration).
- **Auth:** NONE. Identity = display name + server-generated `id`. The client stores its `id` locally and presents it as `userId` on requests and on the WS `auth` frame. Treat the provided `userId` as trusted for the demo.
- **IDs:** generate with `crypto.randomUUID()` (string UUIDs) for all primary keys and message ids.
- **Timestamps:** store and return **epoch milliseconds (integer)**. Field name `createdAt` / `updatedAt` / `startedAt` etc.
- **AI:** fully local, deterministic, no network, no API key. Two endpoints (note-gen, smart-reply). Algorithm guidance in §4.
- **CORS:** same-origin, so not required; if you add it, allow same-origin only.
- **Errors:** non-2xx responses return `{ "error": "<machine_code>", "message": "<human text>" }`. Use 400 (validation), 404 (not found), 409 (conflict), 500 (server).

---

## 1. Data Model (SQLite tables)

### `users`
| column | type | notes |
|--------|------|-------|
| `id` | TEXT PRIMARY KEY | UUID, server-generated |
| `display_name` | TEXT NOT NULL | non-empty, trimmed |
| `created_at` | INTEGER NOT NULL | epoch ms |
| `last_seen_at` | INTEGER | epoch ms; updated on WS connect/activity |

> Presence (online/offline) is **runtime state** held in memory (set of connected userIds on the WS server), not a DB column. `last_seen_at` is the persisted fallback.

### `conversations`
1:1 only for the demo. Enforce uniqueness of the unordered pair.
| column | type | notes |
|--------|------|-------|
| `id` | TEXT PRIMARY KEY | UUID |
| `user_a` | TEXT NOT NULL | FK users.id; store as the lexicographically smaller id |
| `user_b` | TEXT NOT NULL | FK users.id; the larger id |
| `created_at` | INTEGER NOT NULL | epoch ms |

> Add a UNIQUE index on `(user_a, user_b)`. Helper: given two userIds, sort them, then upsert/find the conversation.

### `messages`
| column | type | notes |
|--------|------|-------|
| `id` | TEXT PRIMARY KEY | UUID |
| `conversation_id` | TEXT NOT NULL | FK conversations.id |
| `sender_id` | TEXT NOT NULL | FK users.id |
| `body` | TEXT NOT NULL | non-empty after trim |
| `status` | TEXT NOT NULL | `sent` \| `delivered` \| `read` |
| `created_at` | INTEGER NOT NULL | epoch ms |

> Index on `(conversation_id, created_at)`.

### `notes`
| column | type | notes |
|--------|------|-------|
| `id` | TEXT PRIMARY KEY | UUID |
| `owner_id` | TEXT NOT NULL | FK users.id |
| `title` | TEXT NOT NULL | may be auto-generated for AI notes |
| `body` | TEXT NOT NULL | |
| `source` | TEXT NOT NULL | `manual` \| `ai` (default `manual`) |
| `created_at` | INTEGER NOT NULL | epoch ms |
| `updated_at` | INTEGER NOT NULL | epoch ms |

### `call_logs`
| column | type | notes |
|--------|------|-------|
| `id` | TEXT PRIMARY KEY | UUID |
| `caller_id` | TEXT NOT NULL | FK users.id |
| `callee_id` | TEXT NOT NULL | FK users.id |
| `type` | TEXT NOT NULL | `voice` \| `video` |
| `status` | TEXT NOT NULL | `completed` \| `missed` \| `declined` |
| `started_at` | INTEGER NOT NULL | epoch ms (when call initiated) |
| `ended_at` | INTEGER | epoch ms (null until ended) |
| `duration_sec` | INTEGER | computed on end; 0 for missed/declined |

---

## 2. REST API Contract

Base path: `/api`. All bodies and responses are JSON (`Content-Type: application/json`). All timestamps epoch ms.

### 2.1 Users / Registration

**POST `/api/users`** — register (lightweight, no password)
- Request: `{ "displayName": "Alex" }`
- Validation: `displayName` required, trimmed, 1–40 chars.
- Response `201`:
```json
{ "id": "uuid", "displayName": "Alex", "createdAt": 1718521200000 }
```

**GET `/api/users`** — list all users (for the contacts picker)
- Query (optional): `?excludeId=<uuid>` to omit the caller.
- Response `200`:
```json
[ { "id": "uuid", "displayName": "Alex", "online": true, "lastSeenAt": 1718521200000 } ]
```
> `online` derived from the in-memory connected set.

**GET `/api/users/:id`** — fetch one user
- Response `200`: `{ "id","displayName","online","lastSeenAt" }`; `404` if absent.

### 2.2 Conversations & Messages

**POST `/api/conversations`** — get-or-create a 1:1 conversation
- Request: `{ "userId": "uuidA", "peerId": "uuidB" }`
- Response `200` (existing) or `201` (created):
```json
{ "id": "convUuid", "userA": "uuidLo", "userB": "uuidHi", "createdAt": 1718521200000 }
```
- `400` if userId === peerId or either not found.

**GET `/api/conversations?userId=<uuid>`** — list a user's conversations
- Response `200`: array, most-recent-activity first:
```json
[ {
  "id": "convUuid",
  "peer": { "id": "uuid", "displayName": "Bob", "online": false },
  "lastMessage": { "body": "hey", "createdAt": 1718521200000, "senderId": "uuid" },
  "createdAt": 1718521000000
} ]
```

**GET `/api/conversations/:id/messages`** — message history
- Query (optional): `?limit=50&before=<epochMs>` for paging; default newest 50 ascending by `created_at`.
- Response `200`:
```json
[ { "id":"uuid","conversationId":"convUuid","senderId":"uuid","body":"hey","status":"read","createdAt":1718521200000 } ]
```

> **Note:** the primary path for *sending* a message is the WebSocket `chat:send` frame (§3), so delivery is real-time. This REST endpoint is for loading history. You MAY also expose `POST /api/conversations/:id/messages` (body `{ "senderId","body" }`) as a fallback that persists and returns the created message — implement it, but the WS path is canonical.

### 2.3 Notes (CRUD)

**GET `/api/notes?ownerId=<uuid>`** — list, most-recent (`updated_at`) first
- Response `200`: array of note objects.

**POST `/api/notes`** — create
- Request: `{ "ownerId":"uuid", "title":"My note", "body":"..." }` (`source` defaults `manual`)
- Response `201`:
```json
{ "id":"uuid","ownerId":"uuid","title":"My note","body":"...","source":"manual","createdAt":1718521200000,"updatedAt":1718521200000 }
```

**GET `/api/notes/:id`** — fetch one. `200` or `404`.

**PUT `/api/notes/:id`** — update title/body
- Request: `{ "title":"...", "body":"..." }` (either or both). Bumps `updated_at`.
- Response `200`: updated note object.

**DELETE `/api/notes/:id`** — `204` on success, `404` if absent.

### 2.4 AI endpoints (local, deterministic, offline)

**POST `/api/ai/generate-note`** — summarize a conversation into a saved note
- Request: `{ "ownerId":"uuid", "conversationId":"convUuid" }`
- Behavior: read that conversation's messages, run the deterministic summarizer (§4), create a note with `source:"ai"`, auto-title (e.g. "Summary — chat with Bob"), and **persist it**.
- Response `201`: the created note object (same shape as §2.3), plus:
```json
{ "...note fields...", "summary": "…", "actionItems": ["…","…"] }
```
- `400` if conversation has zero messages.

**POST `/api/ai/smart-reply`** — suggest replies to the latest received message
- Request: `{ "conversationId":"convUuid", "userId":"uuid" }` (userId = the one asking, so we reply to the *other* party's latest message)
- Behavior: deterministic suggestions (§4) based on the latest message NOT sent by `userId`.
- Response `200`:
```json
{ "suggestions": ["Sounds good!", "Can you tell me more?", "Let me check and get back to you."] }
```
- Return 2–4 suggestions. If no incoming message exists, return a generic non-empty set.

### 2.5 Call logs

**POST `/api/calls`** — create a call-log entry when a call is initiated (or upsert on end)
- Request: `{ "callerId":"uuid", "calleeId":"uuid", "type":"voice|video", "status":"completed|missed|declined", "startedAt":1718521200000, "endedAt":1718521260000 }`
- `endedAt`/`duration` optional at creation. Server computes `duration_sec` from `startedAt`→`endedAt` when both present (0 for missed/declined).
- Response `201`: the created call-log object.

> Acceptable alternative: `POST /api/calls` to create at initiation, `PATCH /api/calls/:id` to set final status/endedAt. Either is fine — just document which you ship.

**GET `/api/calls?userId=<uuid>`** — list calls where the user was caller or callee, newest first
- Response `200`:
```json
[ { "id":"uuid","callerId":"uuid","calleeId":"uuid","type":"video","status":"completed","startedAt":1718521200000,"endedAt":1718521260000,"durationSec":60 } ]
```

---

## 3. WebSocket Protocol (`/ws`)

One connection per client. **Envelope:** every frame is JSON `{ "type": "<string>", "...payload": ... }`. The server routes by `type`. Below, **C→S** = client to server, **S→C** = server to client.

### 3.1 Connection / Auth / Presence

- **C→S `auth`** — first frame after connect: `{ "type":"auth", "userId":"uuid" }`. Server maps the socket → userId, marks user online, updates `last_seen_at`.
- **S→C `auth:ok`** — `{ "type":"auth:ok", "userId":"uuid" }`.
- **S→C `presence`** — broadcast when any user connects/disconnects: `{ "type":"presence", "userId":"uuid", "online":true }`.
- On disconnect: mark offline, broadcast `presence online:false`, update `last_seen_at`.
- Recommend a ping/pong heartbeat (~30s) to detect dead sockets.

### 3.2 Chat (canonical send path)

- **C→S `chat:send`** — `{ "type":"chat:send", "conversationId":"convUuid", "senderId":"uuid", "body":"hi", "clientTempId":"abc" }`
  - Server: validate non-empty body; persist message (`status:"sent"`); echo back to sender and deliver to recipient.
- **S→C `chat:new`** — to **both** parties: `{ "type":"chat:new", "message": { ...message object... }, "clientTempId":"abc" }`. (`clientTempId` lets the sender reconcile the optimistic bubble.)
- **S→C `chat:status`** — `{ "type":"chat:status", "messageId":"uuid", "status":"delivered"|"read" }`.
  - On successful delivery to an online recipient → mark `delivered` and notify sender.
  - **C→S `chat:read`** — `{ "type":"chat:read", "conversationId":"convUuid", "userId":"uuid" }` when the recipient views the thread → server marks unread incoming messages `read` and emits `chat:status read` to the sender.

### 3.3 Typing indicator

- **C→S `typing`** — `{ "type":"typing", "conversationId":"convUuid", "userId":"uuid", "isTyping":true }`.
- **S→C `typing`** — relay to the other party: `{ "type":"typing", "conversationId":"convUuid", "userId":"uuid", "isTyping":true }`.

### 3.4 WebRTC signaling (voice & video share the same frames)

The server is a **dumb relay** for signaling — it forwards frames to the target user; media never touches the server. `callType` distinguishes voice vs video. Include a `callId` (client-generated UUID) so both ends correlate the session and the call log.

- **C→S `call:invite`** — `{ "type":"call:invite", "callId":"uuid", "from":"uuid", "to":"uuid", "callType":"voice"|"video" }`
  - Server relays to callee. If callee offline → reply to caller `call:unavailable`.
- **S→C `call:incoming`** — to callee: `{ "type":"call:incoming", "callId","from","fromName","callType" }`.
- **C→S / S→C `call:accept`** — `{ "type":"call:accept", "callId","from","to" }` (callee → caller, relayed).
- **C→S / S→C `call:decline`** — `{ "type":"call:decline", "callId","from","to" }` (relayed; sender should log `declined`).
- **C→S / S→C `call:cancel`** — caller aborts before answer (relayed; log `missed`).
- **C→S / S→C `call:end`** — `{ "type":"call:end", "callId","from","to" }` (either party; relayed; both go idle).
- **C→S / S→C `webrtc:offer`** — `{ "type":"webrtc:offer", "callId","from","to", "sdp": { ... } }` (relayed verbatim).
- **C→S / S→C `webrtc:answer`** — `{ "type":"webrtc:answer", "callId","from","to", "sdp": { ... } }` (relayed verbatim).
- **C→S / S→C `webrtc:ice`** — `{ "type":"webrtc:ice", "callId","from","to", "candidate": { ... } }` (relayed verbatim).
- **S→C `call:unavailable`** — `{ "type":"call:unavailable", "callId","to" }` when target offline.

> **Relay rule:** for any `call:*` and `webrtc:*` frame, look up the socket for the `to` userId and forward the frame unchanged (you may add `fromName`). Drop silently / send `call:unavailable` if the target is not connected.

> **Call logging interaction:** the demo can write call logs via the REST `/api/calls` endpoint from the client at end-of-call, OR you may write them server-side off the signaling frames. Pick one and document it. Frontend prefers the REST path so it owns the duration timing.

### 3.5 Error frame
- **S→C `error`** — `{ "type":"error", "code":"<machine>", "message":"<text>" }` for malformed frames / unknown types.

---

## 4. AI helper (deterministic, offline) — implementation guidance

No external calls. Keep it simple and reproducible:

**generate-note (`summarize`)**
1. Pull conversation messages in order.
2. Build a summary: e.g. participant names + message count + first/last timestamps, then the top-N "salient" lines chosen by a deterministic heuristic (longest messages, or messages containing keywords like dates, "?", "need", "let's", "meet", "send", "todo"). Concatenate into 2–5 sentences.
3. Extract `actionItems`: lines/sentences containing imperative or task keywords (`need to`, `let's`, `please`, `can you`, `todo`, `remember`, `by <time/day>`). Dedupe.
4. Title: `"Summary — chat with <peerName>"`.
5. Save as note `source:"ai"`; return note + `summary` + `actionItems`.

**smart-reply**
1. Take the latest message not authored by the requester.
2. Map to suggestions deterministically: if it ends with `?` → include a clarifying/affirmative pair; if it contains a time/date → include "Works for me" / "Can we do another time?"; otherwise return a fixed set of generic short replies. Always return 2–4 non-empty strings.

Determinism matters so the demo and QA are reproducible. No randomness, no network.

---

## 5. Acceptance criteria — backend "done" before handoff to Frontend

You may hand off to Frontend when ALL of the following hold:

- [ ] Server boots with one command, creates `bevane.db` and all 5 tables idempotently, and serves static PWA assets same-origin.
- [ ] **Users:** `POST /api/users` returns a generated id; `GET /api/users` lists users with correct `online` flags.
- [ ] **Conversations:** get-or-create is idempotent for a user pair (no duplicate conversation for the same two users).
- [ ] **Messaging (WS):** `chat:send` persists and delivers `chat:new` to both parties in real time; history via `GET /…/messages` returns persisted messages in order; `delivered` and `read` status transitions work and notify the sender.
- [ ] **Typing & presence:** `typing` relays correctly; `presence` broadcasts on connect/disconnect; `last_seen_at` updates.
- [ ] **WebRTC signaling:** `call:invite` → `call:incoming`, and `webrtc:offer/answer/ice` relay verbatim to the correct target; offline target yields `call:unavailable`; `call:end`/`call:decline`/`call:cancel` relay. Verified by establishing a real call between two browser tabs.
- [ ] **Call logs:** `POST /api/calls` + `GET /api/calls?userId=` work; `duration_sec` computed correctly; status values constrained to the allowed set.
- [ ] **Notes:** full CRUD works and persists; list ordered by `updated_at` desc.
- [ ] **AI:** `POST /api/ai/generate-note` saves an `ai` note with `summary` + `actionItems` from real conversation messages; `POST /api/ai/smart-reply` returns 2–4 suggestions; **both work with no network / no API key.**
- [ ] **Errors:** validation failures return the documented `{error,message}` shape with correct HTTP codes; empty/whitespace messages rejected.
- [ ] A short `backend/README.md` documents: how to run, the env/port, the chosen call-log approach (REST vs server-side), and any STUN server config for WebRTC.

When done, write your handoff to Frontend at `communication-history/02_Backend_to_Frontend.md` referencing this contract. If you need any field/shape change, flag it back to me first so the user stories and Frontend stay in sync.

Thanks,
**Business Analyst Agent**
