# Bevane Backend — API Specification (source of truth)

This is the implemented contract. The Frontend codes against this verbatim.

- **Base URL:** same-origin. Call `fetch('/api/...')` — no host/port needed.
- **WebSocket URL:** `ws(s)://<host>/ws` (use `wss` when the page is HTTPS).
- **Content-Type:** `application/json` for all request/response bodies.
- **Timestamps:** epoch milliseconds (integers).
- **IDs:** UUID strings (`crypto.randomUUID()`), server-generated.
- **Auth:** none. Identity = `displayName` + server-issued `id`. The client stores
  its `id` and sends it as `userId`/`senderId`/`ownerId` and on the WS `auth` frame.
- **Errors:** non-2xx → `{ "error": "<machine_code>", "message": "<human text>" }`
  with HTTP 400 (validation) / 404 (not found) / 409 (conflict) / 500 (server).

---

## REST endpoints

### Users
| Method | Path | Body / Query | Success |
|--------|------|--------------|---------|
| POST | `/api/users` | `{ "displayName": "Alex" }` (1–40 chars) | `201 { id, displayName, createdAt }` |
| GET | `/api/users` | `?excludeId=<uuid>` (optional) | `200 [ { id, displayName, online, lastSeenAt } ]` |
| GET | `/api/users/:id` | — | `200 { id, displayName, online, lastSeenAt }` / `404` |

`online` is derived live from the in-memory WS-connected set.

### Conversations & Messages
| Method | Path | Body / Query | Success |
|--------|------|--------------|---------|
| POST | `/api/conversations` | `{ "userId", "peerId" }` | `201` (created) or `200` (existing) `{ id, userA, userB, createdAt }` |
| GET | `/api/conversations` | `?userId=<uuid>` | `200 [ { id, peer:{id,displayName,online}, lastMessage:{body,createdAt,senderId}\|null, createdAt } ]` (most-recent activity first) |
| GET | `/api/conversations/:id/messages` | `?limit=50&before=<epochMs>` (optional) | `200 [ { id, conversationId, senderId, body, status, createdAt } ]` (ascending) |
| POST | `/api/conversations/:id/messages` | `{ "senderId", "body" }` | `201 { message }` — **fallback only; WS `chat:send` is canonical** |

- `userA`/`userB` are the unordered pair stored sorted (smaller id = `userA`).
- get-or-create is idempotent: same two users never produce a duplicate conversation.
- `message.status` ∈ `sent | delivered | read`.
- **Round-2 additive message fields** (storage only — defaults applied, no endpoints to set them this round): every `message` now also includes `replyTo` `string|null`, `deleted` `0|1` (default `0`), `reactions` `object` (default `{}`, e.g. `{"❤️":["userId1"]}`). Live reaction broadcast / unsend are **frontend stubs this round**.

### Notes
| Method | Path | Body / Query | Success |
|--------|------|--------------|---------|
| GET | `/api/notes` | `?ownerId=<uuid>` | `200 [ note ]` (updated_at desc) |
| POST | `/api/notes` | `{ "ownerId", "title", "body" }` (`source` defaults `manual`) | `201 note` |
| GET | `/api/notes/:id` | — | `200 note` / `404` |
| PUT | `/api/notes/:id` | `{ "title"?, "body"?, "folder"?, "pinned"?, "color"?, "reminderAt"?, "locked"?, "checklist"? }` (any subset; at least one) | `200 note` (bumps `updatedAt`) |
| DELETE | `/api/notes/:id` | — | `204` / `404` |

`note` = `{ id, ownerId, title, body, source, createdAt, updatedAt, folder, pinned, color, reminderAt, locked, checklist }`, `source ∈ manual | ai`.

**Round-2 note fields (additive — pre-existing notes get defaults):**
- `folder` `string|null` — free-text folder/label.
- `pinned` `0|1` (default `0`). Listing sorts pinned-first, then `updatedAt` desc.
- `color` `string|null` — e.g. a hex string `"#ffcc00"`.
- `reminderAt` `number|null` — epoch ms. **Stored only; reminder firing is a frontend/[ROADMAP] concern.**
- `locked` `0|1` (default `0`). **Stored only; lock enforcement is frontend-side.**
- `checklist` `array|null` — JSON array, e.g. `[{"text":"buy milk","done":false}]`. Echoed back as a parsed array.

`POST /api/notes` also accepts these same optional fields. Booleans may be sent as `true/false` or `1/0`. Omitted fields default to `null`/`0`. Requests sending only the v1 `{title,body}` keep working unchanged.

### AI (local, deterministic, offline — no network, no API key)
| Method | Path | Body | Success |
|--------|------|------|---------|
| POST | `/api/ai/generate-note` | `{ "ownerId", "conversationId" }` | `201 { ...note (source:"ai"), summary, actionItems:[...] }` — note is persisted. `400` if conversation has no messages. |
| POST | `/api/ai/smart-reply` | `{ "conversationId", "userId" }` | `200 { suggestions: [2–4 strings] }` (replies to the latest message NOT sent by `userId`) |
| POST | `/api/ai/tone-adjust` | `{ "text", "tone":"friendly\|formal\|concise\|enthusiastic" }` | `200 { result, tone }`. `400` if `text` empty or `tone` unknown. |
| POST | `/api/ai/translate` | `{ "text", "targetLang":"es\|fr\|vi\|de\|..." }` | `200 { result, targetLang, sourceLang:"auto" }`. `400` if `text` or `targetLang` empty. **Demo translation only** (built-in phrase map for es/fr/vi/de; otherwise echo with a `[lang]` tag). |
| POST | `/api/ai/chat-summary` | `{ "conversationId" }` | `200 { summary, bullets:[...] }`. `404` if conversation missing; `400` if it has no messages. |
| POST | `/api/ai/note-summarize` | `{ "text" }` **or** `{ "noteId" }` | `200 { summary, bullets:[...] }`. If `text` empty/absent, falls back to the body of `noteId`. `400` if neither resolves to text; `404` if `noteId` not found. |
| POST | `/api/ai/smart-tags` | `{ "text" }` | `200 { tags:[3–6 strings] }` (top keywords, deterministic). `400` if empty. |
| POST | `/api/ai/action-items` | `{ "text" }` | `200 { actionItems:[...] }` (TODO/checkbox/imperative lines; may be `[]`). `400` if empty. |
| POST | `/api/ai/ask-about-note` | `{ "text", "question" }` | `200 { answer }` (extractive; `"I couldn't find that in the note."` if no match). `400` if `text` or `question` empty. |

All Round-2 AI endpoints are **local, deterministic, offline** (no network, no API key). Same input → same output. Label output as "AI-generated (offline demo)" in the UI.

### Groups (Round-2, MINIMAL — storage + listing only; no media/message fan-out)
| Method | Path | Body / Query | Success |
|--------|------|--------------|---------|
| POST | `/api/groups` | `{ "ownerId", "name", "memberIds":[uuid] }` | `201 { id, name, ownerId, memberIds, createdAt }` |
| GET | `/api/groups` | `?userId=<uuid>` | `200 [ { id, name, ownerId, memberIds, createdAt } ]` (newest first) |

- The owner is always included in `memberIds` (server-added, de-duped). Unknown member ids are dropped silently.
- **No group messaging/calls/media this round** — there is no group chat send/relay. The frontend stubs group conversations (a group thread may exist in the UI but sends are local-only stubs).

### Call logs (REST owns timing/duration)
| Method | Path | Body / Query | Success |
|--------|------|--------------|---------|
| POST | `/api/calls` | `{ "callerId", "calleeId", "type":"voice\|video", "status":"completed\|missed\|declined", "startedAt"?, "endedAt"? }` | `201 callLog` |
| PATCH | `/api/calls/:id` | `{ "status"?, "endedAt"? }` | `200 callLog` / `404` |
| GET | `/api/calls` | `?userId=<uuid>` | `200 [ callLog ]` (newest first; user as caller or callee) |

`callLog` = `{ id, callerId, calleeId, type, status, startedAt, endedAt, durationSec }`.
Server computes `durationSec` from `startedAt`→`endedAt`; `0` for missed/declined; `null` until `endedAt` set.

---

## WebSocket protocol (`/ws`)

One connection per client. Every frame is JSON `{ "type": "...", ...payload }`.
Send an `auth` frame first; all other frames require an authed socket.

### Connection / presence
| Dir | Type | Payload |
|-----|------|---------|
| C→S | `auth` | `{ type, userId }` |
| S→C | `auth:ok` | `{ type, userId }` |
| S→C | `presence` | `{ type, userId, online }` (broadcast on connect/disconnect) |
| S→C | `error` | `{ type, code, message }` (malformed/unknown/not-authed frames) |

The server replaces an existing socket for the same `userId` (sends the old socket
an `error code:"replaced"` then closes it). Heartbeat ping/pong every 30s.

### Chat
| Dir | Type | Payload |
|-----|------|---------|
| C→S | `chat:send` | `{ type, conversationId, senderId, body, clientTempId }` |
| S→C | `chat:new` | `{ type, message, clientTempId? }` — echoed to sender (with `clientTempId`) and delivered to recipient (without) |
| S→C | `chat:status` | `{ type, messageId, status:"delivered"\|"read" }` |
| C→S | `chat:read` | `{ type, conversationId, userId }` → marks incoming msgs read, emits `chat:status read` to each sender |

When a recipient is online, the message is persisted `delivered` and the sender gets `chat:status delivered`.

### Typing
| Dir | Type | Payload |
|-----|------|---------|
| C→S / S→C | `typing` | `{ type, conversationId, userId, isTyping }` (relayed to the other party) |

### WebRTC signaling (server is a dumb relay; media is peer-to-peer)
| Dir | Type | Payload |
|-----|------|---------|
| C→S | `call:invite` | `{ type, callId, from, to, callType:"voice"\|"video" }` |
| S→C | `call:incoming` | `{ type, callId, from, fromName, callType }` (to callee) |
| C→S / S→C | `call:accept` | `{ type, callId, from, to }` |
| C→S / S→C | `call:decline` | `{ type, callId, from, to }` |
| C→S / S→C | `call:cancel` | `{ type, callId, from, to }` (caller aborts before answer) |
| C→S / S→C | `call:end` | `{ type, callId, from, to }` |
| C→S / S→C | `webrtc:offer` | `{ type, callId, from, to, sdp }` (relayed verbatim) |
| C→S / S→C | `webrtc:answer` | `{ type, callId, from, to, sdp }` (relayed verbatim) |
| C→S / S→C | `webrtc:ice` | `{ type, callId, from, to, candidate }` (relayed verbatim) |
| S→C | `call:unavailable` | `{ type, callId, to }` (target offline) |

Relay rule: any `call:*` / `webrtc:*` frame is forwarded unchanged to the socket
for `to` (server adds `fromName`). If `to` is offline: `call:invite`/`call:accept`/
`webrtc:offer` get a `call:unavailable` back to the sender; other types drop silently.

Call-log writes: **REST `POST /api/calls`** at end-of-call (the frontend owns
duration timing). The server does not auto-write logs from signaling frames.
