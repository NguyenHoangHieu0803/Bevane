# Handoff 05 — BA → Backend (v2)

**From:** Business Analyst Agent
**To:** Backend Developer Agent
**Date:** 2026-06-16
**Subject:** Round-2 light backend support for the full-spec expansion (keep it SMALL)

---

## TL;DR

Round 2 expands Bevane to the **full product surface**, but the strategy is **"full spec, stubs allowed"** — most new features ship as **frontend-only stubs** ("Coming soon"). So **your work this round is intentionally small**: a few cheap schema additions plus a handful of new **deterministic, offline** AI endpoints in `src/ai.js`. Do **not** build group media relay, real auth, push, or ML. The existing v1 API contract (`backend/api_specs.md`) stays valid and unchanged for current behavior.

Reference docs: `docs/business_requirements.md` (v2), `docs/feature_specs/*`, `docs/screen_flow.md`, `docs/ROADMAP.md`.

**Priority order:** (d) new AI endpoints **[REQUIRED]** → (c) note columns **[RECOMMENDED]** → (b) message fields **[RECOMMENDED]** → (a) groups **[OPTIONAL/MINIMAL]**.

---

## (a) Groups / group-conversation concept — **[OPTIONAL, MINIMAL]**

Just enough for the UI to show a group thread; **no media/fan-out** required this round.

- New table `groups(id TEXT PK, name TEXT, ownerId TEXT, createdAt INTEGER)`.
- New table `group_members(groupId TEXT, userId TEXT, joinedAt INTEGER)`.
- Endpoints (only if cheap):
  - `POST /api/groups` → body `{ "ownerId", "name", "memberIds": [uuid] }` → `201 { id, name, ownerId, memberIds, createdAt }`.
  - `GET /api/groups?userId=<uuid>` → `200 [ { id, name, ownerId, memberIds, createdAt } ]`.
- **Mark optional.** If skipped, the frontend stubs group chat entirely. If included, real group messaging is **not** required — the UI may still stub sends.

---

## (b) Message fields: reactions / reply_to / deleted — **[RECOMMENDED, if cheap]**

Add nullable columns to the existing messages table so future rounds can light these up. **No new endpoints required**; storage only this round.

- `reply_to TEXT NULL` — id of the message being replied to.
- `deleted INTEGER NOT NULL DEFAULT 0` — 0/1 unsend flag.
- `reactions TEXT NULL` — JSON map e.g. `{"❤️":["userId1"],"👍":["userId2"]}`.

If you want to wire one cheaply, you may include these in the `chat:new` / message payloads as pass-through fields (default null/empty). **Live reaction broadcast and delete are NOT required this round** — UI stubs them.

---

## (c) Note columns — **[RECOMMENDED]**

Add nullable columns to the notes table so the Notes UI can persist these later with minimal churn. **Extend the existing `note` object** to echo them (default null/empty). No new endpoints required.

- `folder TEXT NULL`
- `pinned INTEGER NOT NULL DEFAULT 0`
- `color TEXT NULL`
- `reminder_at INTEGER NULL` (epoch ms)
- `locked INTEGER NOT NULL DEFAULT 0`
- `checklist TEXT NULL` (JSON array, e.g. `[{"text":"buy milk","done":false}]`)

`PUT /api/notes/:id` should accept any of these as optional fields and persist them. Reminder firing, lock enforcement, etc. are **frontend/[ROADMAP]** — you only store the values.

---

## (d) New offline AI endpoints in `src/ai.js` — **[REQUIRED]**

All must be **local, deterministic, offline — no network, no API key**, same style as existing `generate-note` / `smart-reply`. Keep them simple (heuristic string ops are fine). Each response must be safe to label "AI-generated" in the UI.

### 1. `POST /api/ai/tone-adjust` — **[REQUIRED]**
Rewrite a draft into a tone.
- Request: `{ "text": "string", "tone": "friendly|formal|concise|enthusiastic" }`
- Response `200`: `{ "result": "string", "tone": "friendly" }`
- `400` if `text` empty or `tone` unknown.

### 2. `POST /api/ai/translate` — **[REQUIRED, simple]**
Simple/deterministic translation (a small built-in phrase map + passthrough is acceptable; mark clearly as a demo translation).
- Request: `{ "text": "string", "targetLang": "es|fr|vi|de|..." }`
- Response `200`: `{ "result": "string", "targetLang": "es", "sourceLang": "auto" }`
- `400` if `text` empty.

### 3. `POST /api/ai/chat-summary` — **[REQUIRED]**
Summarize a conversation.
- Request: `{ "conversationId": "uuid" }` (server reads stored messages)
- Response `200`: `{ "summary": "string", "bullets": ["...", "..."] }`
- `400` if conversation has no messages. (Reuse logic from `generate-note`.)

### 4. `POST /api/ai/note-summarize` — **[REQUIRED]**
Condense a note body.
- Request: `{ "text": "string" }` (or `{ "noteId": "uuid" }` — your choice; document it)
- Response `200`: `{ "summary": "string", "bullets": ["..."] }`
- `400` if empty.

### 5. `POST /api/ai/smart-tags` — **[REQUIRED]**
Suggest tags for a note.
- Request: `{ "text": "string" }`
- Response `200`: `{ "tags": ["work","todo","budget"] }` (3–6 tags, deterministic, e.g. top keywords)
- `400` if empty.

### 6. `POST /api/ai/action-items` — **[REQUIRED]**
Extract action items / TODOs.
- Request: `{ "text": "string" }`
- Response `200`: `{ "actionItems": ["Call Sam","Send invoice"] }` (may be empty array)
- `400` if empty.

### 7. `POST /api/ai/ask-about-note` — **[REQUIRED]**
Answer a question against a note's content.
- Request: `{ "text": "string", "question": "string" }`
- Response `200`: `{ "answer": "string" }` (deterministic extractive answer; if no match, a graceful "I couldn't find that in the note." is fine)
- `400` if `text` or `question` empty.

> **Optional extras (skip if time-constrained):** `post-call-summary` can simply alias `chat-summary` semantics if a call transcript existed — but since transcription is a frontend stub this round, **do not build it**; the UI stubs post-call summary.

---

## What you must NOT build this round (keep scope small)
- Real group voice/video media, SFU/TURN, fan-out delivery.
- Real auth: passwords, OTP delivery, OAuth, sessions, account recovery.
- Push notifications, media/file upload & storage, reminders firing, note lock enforcement.
- Any ML (noise cancel, virtual bg, captions, emotion, gesture) or external API calls.
These are **frontend stubs** or **[ROADMAP]** (see `docs/ROADMAP.md`).

---

## Update the contract & acceptance criteria

After implementing, **update `backend/api_specs.md`** with the new endpoints/columns so Frontend codes against it verbatim, then hand off to Frontend.

**Acceptance criteria — Backend is "done" for v2 when:**
1. All seven required `/api/ai/*` endpoints exist, run **offline with no API key**, return the documented JSON shapes, and validate empty/invalid input with `400 { error, message }`.
2. Note columns `folder, pinned, color, reminder_at, locked, checklist` exist, are accepted by `PUT /api/notes/:id`, and are echoed in every `note` response (defaults applied) — **existing notes still load** (migration is non-destructive).
3. Message columns `reply_to, deleted, reactions` exist with safe defaults; existing messaging behavior is **unchanged** and still passes v1 acceptance criteria.
4. (If included) groups endpoints return the documented shapes; (if skipped) it is noted in `api_specs.md` as not implemented.
5. All v1 [WORKING] behavior (messaging, calls, notes CRUD, generate-note, smart-reply) is **regression-free**.
6. `backend/api_specs.md` is updated to reflect every change; optional items are clearly marked.

---

## Handoff target
Once the above is met and `api_specs.md` is updated, hand off to the **Frontend Agent** to build the full UI surface (working features + clearly-labeled "Coming soon" stubs) per `docs/feature_specs/*` and `docs/screen_flow.md`.
