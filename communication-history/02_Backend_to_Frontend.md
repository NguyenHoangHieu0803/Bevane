# Handoff: Backend Developer → Frontend Developer

**From:** Backend Developer Agent
**To:** Frontend Developer Agent
**Date:** 2026-06-16
**Subject:** Bevane demo — backend is live and verified. Finalized REST + WebSocket contract to integrate against.

---

Hi Frontend,

The backend is implemented, running, and verified end-to-end against the BA's
contract (`communication-history/01_BA_to_Backend.md`). You can integrate
without guessing — everything below is copy-pasteable and matches what the
server actually returns. The canonical, always-up-to-date spec is
`backend/api_specs.md`; this handoff is the integration brief.

## 0. How to run / where your files go

```bash
npm install && npm start     # server on http://0.0.0.0:3000
```

- **Put your PWA files in `/workspaces/Bevane/public`.** The server already
  serves that folder static, same-origin. There's a placeholder `index.html`
  there now — replace it. Manifest, service worker, JS, CSS all go in `public/`.
- Unknown non-`/api` GET routes fall back to `public/index.html`, so client-side
  routing works.

## 1. Base URLs (same-origin — no host hardcoding)

- **REST:** `fetch('/api/...')`. Do not prefix a host/port.
- **WebSocket:** build the URL from the page origin:
  ```js
  const proto = location.protocol === 'https:' ? 'wss' : 'ws';
  const ws = new WebSocket(`${proto}://${location.host}/ws`);
  ```

## 2. Auth / identity flow (no passwords)

1. On first launch, ask for a display name and `POST /api/users` →
   `{ id, displayName, createdAt }`. **Persist `id` in `localStorage`** — that's
   the user's identity for the whole app.
2. Send that `id` as `userId` / `senderId` / `ownerId` on REST calls.
3. **Authenticate the WebSocket immediately on open** by sending an `auth` frame
   with the same id. Everything else over WS is rejected until `auth:ok` arrives:
   ```js
   ws.onopen = () => ws.send(JSON.stringify({ type: 'auth', userId: myId }));
   ```
   If the user reconnects with the same id, the server replaces the old socket
   (old one gets `{type:'error', code:'replaced'}` then closes).

## 3. REST endpoints (verified responses)

All JSON, timestamps are epoch ms, errors are `{ error, message }` with proper codes.

**Users**
- `POST /api/users` body `{ "displayName": "Alex" }` (1–40 chars)
  → `201 { "id":"...", "displayName":"Alex", "createdAt":1781583103052 }`
- `GET /api/users?excludeId=<myId>`
  → `200 [ { "id","displayName","online","lastSeenAt" } ]` (`online` is live)
- `GET /api/users/:id` → `200 { id, displayName, online, lastSeenAt }` / `404`

**Conversations & messages**
- `POST /api/conversations` body `{ "userId", "peerId" }`
  → `201`(new) or `200`(existing) `{ "id","userA","userB","createdAt" }`.
  Idempotent per user pair. `400` on self-pair or unknown user.
- `GET /api/conversations?userId=<id>`
  → `200 [ { "id", "peer":{"id","displayName","online"}, "lastMessage":{"body","createdAt","senderId"}|null, "createdAt" } ]`
  (most-recent activity first)
- `GET /api/conversations/:id/messages?limit=50&before=<epochMs>`
  → `200 [ { "id","conversationId","senderId","body","status","createdAt" } ]` (ascending)
- `POST /api/conversations/:id/messages` body `{ "senderId","body" }` → `201 message`
  — **fallback only; send via WS `chat:send` for real-time delivery.**

**Notes**
- `GET /api/notes?ownerId=<id>` → `200 [ note ]` (updated_at desc)
- `POST /api/notes` body `{ "ownerId","title","body" }` → `201 note`
- `GET /api/notes/:id` → `200 note` / `404`
- `PUT /api/notes/:id` body `{ "title"?, "body"? }` → `200 note`
- `DELETE /api/notes/:id` → `204` / `404`
- `note = { id, ownerId, title, body, source("manual"|"ai"), createdAt, updatedAt }`

**AI (offline, deterministic — no key, no network)**
- `POST /api/ai/generate-note` body `{ "ownerId","conversationId" }`
  → `201 { ...note(source:"ai"), "summary":"...", "actionItems":["...","..."] }`
  (note is persisted). `400` if the conversation has no messages.
  Real verified output:
  ```json
  { "title":"Summary — chat with Bob",
    "summary":"Conversation between Bob and Alex with 2 messages. ...",
    "actionItems":["Hey Alex, can you send me the report by tomorrow?","Let's meet at 3pm."],
    "source":"ai", ... }
  ```
  **Label AI notes as AI-generated in the UI** (AC-N6).
- `POST /api/ai/smart-reply` body `{ "conversationId","userId" }`
  → `200 { "suggestions":["Works for me!","Can we do another time?","Let me check and confirm."] }`
  (2–4 items, based on the latest message NOT sent by `userId`)

**Call logs** (you own duration timing — write at end-of-call)
- `POST /api/calls` body
  `{ "callerId","calleeId","type":"voice"|"video","status":"completed"|"missed"|"declined","startedAt","endedAt" }`
  → `201 { ..., "durationSec":60 }` (server computes `durationSec`; 0 for missed/declined)
- `PATCH /api/calls/:id` body `{ "status"?, "endedAt"? }` → `200 callLog`
- `GET /api/calls?userId=<id>` → `200 [ callLog ]` (newest first)

## 4. WebSocket message types

Every frame: `{ "type":"...", ...payload }`. Send `auth` first.

**Presence / lifecycle**
- C→S `auth` `{ type, userId }` → S→C `auth:ok` `{ type, userId }`
- S→C `presence` `{ type, userId, online }` (broadcast on any connect/disconnect)
- S→C `error` `{ type, code, message }` (bad JSON, unknown type, not-authed, replaced)

**Chat**
- C→S `chat:send` `{ type, conversationId, senderId, body, clientTempId }`
- S→C `chat:new` `{ type, message, clientTempId? }`
  — sender gets it back WITH `clientTempId` (reconcile your optimistic bubble);
    recipient gets it WITHOUT. `message` = full message object.
- S→C `chat:status` `{ type, messageId, status:"delivered"|"read" }`
- C→S `chat:read` `{ type, conversationId, userId }` (call when the thread is viewed)
  → each original sender receives `chat:status read`.

**Typing**
- C→S / S→C `typing` `{ type, conversationId, userId, isTyping }` (relayed to peer)

**WebRTC signaling** (server only relays; configure your own STUN, e.g.
`stun:stun.l.google.com:19302`)
- C→S `call:invite` `{ type, callId, from, to, callType:"voice"|"video" }`
  → S→C (callee) `call:incoming` `{ type, callId, from, fromName, callType }`
  → if callee offline, caller gets `call:unavailable` `{ type, callId, to }`
- Relayed both ways verbatim (server adds `fromName`):
  `call:accept`, `call:decline`, `call:cancel`, `call:end`
  `{ type, callId, from, to }`
- `webrtc:offer` / `webrtc:answer` `{ type, callId, from, to, sdp }` — relayed verbatim
- `webrtc:ice` `{ type, callId, from, to, candidate }` — relayed verbatim
- Use a client-generated `callId` (UUID) so both ends + the call log correlate.

## 5. Call-log approach (decided)

**You write call logs via REST `POST /api/calls` at end-of-call** (the BA noted
the frontend prefers owning duration timing). The WS layer is a pure relay and
does NOT auto-write logs. Recommended flow: on `call:invite`/`call:incoming`
record `startedAt`; on hang-up/decline/timeout `POST /api/calls` with the final
`status` and `endedAt`. Server computes `durationSec`.

## 6. Deviations from the BA spec

**None that change shapes.** Implementation choices worth noting:
- Shipped **both** `POST /api/calls` and `PATCH /api/calls/:id` (BA listed the
  PATCH variant as an acceptable alternative). Use POST-at-end; PATCH is optional.
- `GET /api/conversations` `peer` object includes `online` (BA example showed it);
  it does not embed `lastSeenAt` on the peer — fetch `/api/users/:id` if you need it.
- On WS, when the recipient is online a message is persisted directly as
  `delivered` and the sender gets a single `chat:status delivered` (no separate
  `sent` event over WS — the `chat:new` echo carries the initial state).
- `error` frame uses field `code` (machine) + `message` (human), matching the BA's
  REST error shape.

If you need any field/shape change, flag it to me and the BA before coding so
the contract stays in sync.

## 7. Acceptance criteria before you hand to QC

- [ ] Identity: register by name, persist `id`, authenticate the WS on open.
- [ ] Messaging: open a conversation, send via `chat:send`, render `chat:new` in
      real time on both tabs; load history via `GET /…/messages`; show
      sent→delivered→read from `chat:status`; reject empty/whitespace messages.
- [ ] Typing indicator + presence (online/offline) reflected in the UI, with
      text/icon (not color alone — AC, A8).
- [ ] Voice + video calls between two tabs/devices: invite → incoming → accept/
      decline; two-way media via WebRTC; in-call mute, camera toggle (video), hang
      up; both sides return to idle on end. Configure a STUN server.
- [ ] Every call attempt logged via `POST /api/calls` with correct type/status,
      and `GET /api/calls?userId=` renders the history.
- [ ] Notes: full CRUD; list most-recent-first; "Generate note" calls
      `/api/ai/generate-note` and shows summary + action items; smart-reply chips
      from `/api/ai/smart-reply`; **AI output clearly labeled** as AI-generated.
- [ ] Accessibility (WCAG 2.1 AA, BRD §5): landmarks, single H1/view, keyboard
      operable + visible focus, `aria-label`s on icon buttons, `aria-live` for new
      messages and incoming calls, contrast ≥ 4.5:1, labeled inputs, ≥44×44px targets.
- [ ] Works fully offline for AI (no external keys) and on iOS Safari via the
      public URL / QR code.

## 8. Verification I ran (all green)

- `npm install` + `node server.js`: boots, creates `data/bevane.db` + all 5 tables,
  serves `public/`, logs the WS endpoint.
- REST curls: registered Alex & Bob; `GET /api/users` shows both with `online`
  flags; `POST /api/conversations` returns 201 then 200 on repeat (idempotent);
  posted + listed messages in order; `generate-note` produced a persisted AI note
  with `summary` + `actionItems`; `smart-reply` returned 3 suggestions; notes
  CRUD + `updated_at` ordering; `POST /api/calls` computed `durationSec:60`;
  error cases returned the documented `{error,message}` with 400/404.
- WebSocket (two sockets): `auth`→`auth:ok`+`presence`; `chat:send`→`chat:new`
  to both (sender keeps `clientTempId`) + `chat:status delivered`; `chat:read`→
  `chat:status read`; `typing` relayed; `call:invite`→`call:incoming` (with
  `fromName`); `webrtc:offer` relayed verbatim; offline target→`call:unavailable`.

Thanks — ping me if any payload is ambiguous.

**Backend Developer Agent**
