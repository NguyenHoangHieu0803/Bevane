# Handoff 06 — Backend → Frontend (v2)

**From:** Backend Developer Agent
**To:** Frontend Developer Agent
**Date:** 2026-06-16
**Subject:** Round-2 backend is live — new offline AI endpoints, extended note schema, additive message fields, minimal groups. Build the full UI; here's exactly what is server-backed vs. what you must stub locally.

---

## TL;DR

Round-2 backend work is intentionally small and **non-breaking**. All v1 endpoints behave exactly as before (verified — see "Regression" below). I added:

1. **7 new offline AI endpoints** (`/api/ai/*`) — real, deterministic, server-backed. **Use these for real.**
2. **6 new note fields** (`folder, pinned, color, reminderAt, locked, checklist`) — persisted + round-trip via POST/PUT `/api/notes`. **Real.**
3. **3 additive message fields** (`replyTo, deleted, reactions`) — **storage only, no setter endpoints.** You stub the UI; persistence is for a later round.
4. **Minimal groups** (`POST/GET /api/groups`) — create + list only. **No group messaging/media** — stub the group thread sends.

`backend/api_specs.md` is updated and is your source of truth. Code against it verbatim.

---

## 1. New AI endpoints — SERVER-BACKED (use for real)

All are local/deterministic/offline (no key, no network). Same input → same output. Label output "AI-generated (offline demo)".

### `POST /api/ai/tone-adjust`
Req: `{ "text": "...", "tone": "friendly|formal|concise|enthusiastic" }`
Res `200`: `{ "result": "...", "tone": "friendly" }` — `400` on empty text or unknown tone.
Example: `{"text":"i cant make it, gonna be late","tone":"formal"}` →
`{"result":"Dear recipient, i cant make it, going to be late. Best regards.","tone":"formal"}`

### `POST /api/ai/translate` (DEMO translation)
Req: `{ "text": "...", "targetLang": "es|fr|vi|de|..." }`
Res `200`: `{ "result": "...", "targetLang": "es", "sourceLang": "auto" }` — `400` on empty text/targetLang.
Built-in phrase map for es/fr/vi/de; unknown words/langs echo with a `[lang]` tag. **Label clearly as a demo.**
Example: `{"text":"hello friend thank you","targetLang":"es"}` → `{"result":"hola amigo gracias",...}`

### `POST /api/ai/chat-summary`
Req: `{ "conversationId": "uuid" }` (server reads stored messages)
Res `200`: `{ "summary": "...", "bullets": ["...","..."] }` — `404` if conversation missing, `400` if no messages.

### `POST /api/ai/note-summarize`
Req: `{ "text": "..." }` **or** `{ "noteId": "uuid" }` (text wins; falls back to the note body)
Res `200`: `{ "summary": "...", "bullets": ["..."] }` — `400` if no text resolved, `404` if `noteId` not found.

### `POST /api/ai/smart-tags`
Req: `{ "text": "..." }`
Res `200`: `{ "tags": ["marketing","budget","meeting", ...] }` (3–6 keyword tags) — `400` if empty.

### `POST /api/ai/action-items`
Req: `{ "text": "..." }`
Res `200`: `{ "actionItems": ["Call Sam about pricing","Send invoice", ...] }` (may be `[]`) — `400` if empty.
Recognizes `- [ ]`/`- [x]` checkboxes, `TODO:` markers, and imperative/keyword sentences.

### `POST /api/ai/ask-about-note`
Req: `{ "text": "...", "question": "..." }`
Res `200`: `{ "answer": "..." }` (extractive single sentence; `"I couldn't find that in the note."` if no match) — `400` if either empty.

> Existing v1 AI (`/api/ai/generate-note`, `/api/ai/smart-reply`) unchanged.
> **`post-call-summary` is NOT built** (call transcription is a frontend stub this round). If you want a "call summary" button, call `chat-summary` on the related conversation, or stub it.

---

## 2. Notes — extended schema (SERVER-BACKED, round-trip)

`note` now = `{ id, ownerId, title, body, source, createdAt, updatedAt, folder, pinned, color, reminderAt, locked, checklist }`.

- `folder` `string|null`
- `pinned` `0|1` (default `0`) — **note lists are sorted pinned-first, then `updatedAt` desc**.
- `color` `string|null` (e.g. `"#ffcc00"`)
- `reminderAt` `number|null` (epoch ms) — **stored only; YOU fire/display the reminder.**
- `locked` `0|1` (default `0`) — **stored only; YOU enforce the lock/PIN gate in the UI.**
- `checklist` `array|null` — JSON array `[{"text":"buy milk","done":false}]`, echoed back parsed.

`POST /api/notes` and `PUT /api/notes/:id` both accept any subset of these. Booleans accept `true/false` or `1/0`. Omitting them keeps existing values (PUT) / applies defaults (POST). **Pre-existing notes load fine with defaults** (verified).

Example POST body:
```json
{ "ownerId":"<uuid>", "title":"Groceries", "body":"weekend",
  "folder":"Personal", "pinned":true, "color":"#ffcc00",
  "checklist":[{"text":"buy milk","done":false}] }
```

---

## 3. Message fields — STORAGE ONLY (stub the UI)

Every `message` payload now also carries `replyTo` (`string|null`), `deleted` (`0|1`, default `0`), `reactions` (`object`, default `{}`). **There is no endpoint or WS frame to set these this round.** Render them if present, but:
- **Reactions:** stub locally (optimistic UI). Not broadcast/persisted yet.
- **Reply-to:** you may show a reply preview client-side; the field round-trips as `null` for now.
- **Unsend/delete:** stub client-side; `deleted` stays `0` server-side.

---

## 4. Groups — MINIMAL (create + list only)

- `POST /api/groups` `{ ownerId, name, memberIds:[uuid] }` → `201 { id, name, ownerId, memberIds, createdAt }`. Owner is auto-added to members; unknown ids dropped.
- `GET /api/groups?userId=<uuid>` → `200 [ group ]` (newest first; returns groups the user is a member of).
- **No group chat send, no group calls, no media fan-out.** A group thread can exist in the UI, but **sends are local-only stubs**. Do NOT expect `chat:send` to work for a group id.

---

## Server-backed vs. UI-only stub — quick map of the ~60 features

**Real backend support now:**
- Tone adjust, translate (demo), chat summary, note summarize, smart tags, action items, ask-about-note.
- Notes: create/read/update/delete + folder, pin, color, reminder value, lock flag, checklist (all persist & sort).
- Groups: create + list membership.
- (v1, still real) 1:1 messaging over WS, presence, typing, read receipts, WebRTC voice/video signaling relay, call logs, generate-note, smart-reply.

**UI-only stubs / [ROADMAP] (no backend this round):**
- Message reactions broadcast, reply threading, unsend/delete (fields exist, no setters).
- Group messaging / group calls / media fan-out, SFU/TURN.
- Real auth (passwords, OTP, OAuth, sessions, recovery), push notifications.
- File/media upload & storage, voice messages, attachments.
- Reminder firing, note lock/PIN enforcement (you own these client-side).
- Any ML: noise cancel, virtual background, live captions/transcription, post-call transcript summary, emotion/gesture, translation beyond the demo phrase map.

Show these as working-where-real and clearly-labeled "Coming soon" stubs per `docs/feature_specs/*` and `docs/screen_flow.md`.

---

## Verification (done before this handoff)

Booted `node server.js`, ran curls, killed it. **No errors in the log.**

- **Migration:** additive only (PRAGMA-guarded `ALTER TABLE`). Confirmed notes now have `folder,pinned,color,reminder_at,locked,checklist`; messages have `reply_to,deleted,reactions`; `groups`/`group_members` exist. Existing rows unaffected.
- **Regression (v1 still passes):** register users ✅, create conversation ✅, REST send + GET messages (now echo `replyTo/deleted/reactions`) ✅, `generate-note` ✅ (also echoes new note fields).
- **Note round-trip:** POST with `folder/pinned/color/checklist` → GET returns them; PUT updates `reminderAt/locked/checklist` ✅.
- **All 7 new AI endpoints** return documented shapes; empty/invalid input returns `400 {error,message}` ✅.
- **Groups:** create (owner auto-member) + list for both members ✅.

---

## Acceptance criteria for your build

1. Notes UI persists folder/pin/color/reminder/lock/checklist via POST/PUT and reflects pinned-first ordering.
2. AI features call the real `/api/ai/*` endpoints and render `result`/`summary`/`bullets`/`tags`/`actionItems`/`answer`; handle `400` gracefully.
3. Reaction/reply/unsend, group sends, auth, push, media, transcription, reminders firing, lock enforcement are clearly-labeled stubs (or client-only) — not wired to non-existent endpoints.
4. v1 chat/calls/notes flows remain functional.

Ping me if any shape needs tweaking.
