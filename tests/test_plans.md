# Bevane — QA/QC Test Plan & Executed Test Cases

**Agent:** QA/QC Full-Stack Agent (final gate)
**Date:** 2026-06-16
**Build under test:** `main` @ initial commit; server `node server.js` on port 3000
**Verified against:** `backend/api_specs.md` + `docs/business_requirements.md` (§4 ACs, §5 a11y)

## Test environment
- Node v24.14.0, Linux Codespace.
- Fresh `data/bevane.db` (deleted before boot to test idempotent migration).
- Server booted in background; confirmed listening on `0.0.0.0:3000`, all 5 tables
  created (`users, conversations, messages, notes, call_logs`).
- Tools: `curl` (REST), custom Node `ws` client (`tests/ws_smoke.js`), `node --check`
  (syntax), Python (WCAG contrast math), source inspection (a11y wiring).

## Method
Hands-on. Every REST endpoint exercised live with happy-path + error/edge cases.
WebSocket protocol exercised with two authenticated live sockets. Frontend assets
fetched over HTTP and content-types asserted. A11y graded by inspecting the served
HTML/CSS and the JS that drives the DOM, plus numeric contrast verification.

---

## 1. REST API test cases (curl) — 42 cases, all PASS

| # | Endpoint / case | Expected | Result |
|---|-----------------|----------|--------|
| 1 | POST /api/users {Alex} | 201 + id/displayName/createdAt | PASS |
| 2 | POST /api/users {Bob} | 201 | PASS |
| 3 | POST /api/users whitespace name | 400 invalid_display_name | PASS |
| 4 | POST /api/users 41-char name | 400 invalid_display_name | PASS |
| 5 | GET /api/users | 200 array w/ online+lastSeenAt | PASS |
| 6 | GET /api/users?excludeId=Alex | 200, Bob only | PASS |
| 7 | GET /api/users/:id (Alex) | 200 single user | PASS |
| 8 | GET /api/users/:id (missing) | 404 not_found | PASS |
| 9 | POST /api/conversations (new) | 201 {id,userA,userB} | PASS |
| 10 | POST /api/conversations (repeat, swapped order) | 200, **same id** (idempotent) | PASS |
| 11 | POST /api/conversations self-pair | 400 same_user | PASS |
| 12 | POST /api/conversations unknown peer | 400 user_not_found | PASS |
| 13 | POST /:id/messages (Alex) | 201 message status:sent | PASS |
| 14 | POST /:id/messages (Bob) | 201 | PASS |
| 15 | POST /:id/messages whitespace body | 400 empty_body | PASS |
| 16 | POST /:id/messages bad conversation | 404 not_found | PASS |
| 17 | GET /:id/messages | 200, 2 msgs ascending | PASS |
| 18 | GET /api/conversations?userId=Alex | 200, peer+lastMessage+createdAt | PASS |
| 19 | GET /api/conversations (no userId) | 400 missing_params | PASS |
| 20 | POST /api/ai/generate-note | 201, source:ai, summary, actionItems, persisted | PASS |
| 21 | POST /api/ai/generate-note (empty conv) | 400 empty_conversation | PASS |
| 22 | POST /api/ai/smart-reply (incoming has time) | 200, 3 time-aware suggestions | PASS |
| 23 | POST /api/ai/smart-reply (no incoming) | 200, generic 3 suggestions | PASS |
| 24 | POST /api/notes (manual) | 201 note source:manual | PASS |
| 25 | POST /api/notes (bad owner) | 400 invalid_owner | PASS |
| 26 | POST /api/notes (empty title+body) | 400 empty_note | PASS |
| 27 | GET /api/notes?ownerId | 200, updated_at desc (manual before older ai) | PASS |
| 28 | GET /api/notes/:id | 200 | PASS |
| 29 | PUT /api/notes/:id | 200, updatedAt bumped | PASS |
| 30 | PUT /api/notes/:id (no fields) | 400 missing_params | PASS |
| 31 | GET /api/notes/:id (missing) | 404 not_found | PASS |
| 32 | DELETE /api/notes/:id | 204 | PASS |
| 33 | DELETE /api/notes/:id (again) | 404 not_found | PASS |
| 34 | POST /api/calls completed (60s span) | 201 durationSec:60 | PASS |
| 35 | POST /api/calls missed | 201 durationSec:0, endedAt:null | PASS |
| 36 | POST /api/calls bad type | 400 invalid_type | PASS |
| 37 | POST /api/calls bad status | 400 invalid_status | PASS |
| 38 | POST /api/calls bad caller | 400 invalid_caller | PASS |
| 39 | PATCH /api/calls/:id status=declined | 200, durationSec recomputed to 0 | PASS |
| 40 | PATCH /api/calls/:id (missing) | 404 not_found | PASS |
| 41 | GET /api/calls?userId=Alex | 200, newest first | PASS |
| 42 | GET /api/bogus (unknown /api) | 404 JSON not_found (no SPA fallthrough) | PASS |

**REST: 42/42 PASS.** All error responses use the documented `{error,message}` shape
with correct HTTP codes (400/404). AI endpoints verified to make no network calls.

---

## 2. WebSocket / real-time test cases (`tests/ws_smoke.js`) — 21 assertions, all PASS

Two live authenticated sockets (WSAlice, WSBob) + one never-connecting user (WSCarl).

| Assertion | Result |
|-----------|--------|
| setup: users + conversation created | PASS |
| auth → auth:ok (Alice) | PASS |
| auth → auth:ok (Bob) | PASS |
| presence broadcast on connect | PASS |
| chat:send → chat:new echo to sender WITH clientTempId | PASS |
| echoed message has correct body + status | PASS |
| chat:new relayed to recipient (Bob) | PASS |
| recipient copy has NO clientTempId | PASS |
| sender receives chat:status delivered (recipient online) | PASS |
| chat:read → chat:status read to original sender | PASS |
| typing relayed to peer | PASS |
| call:invite → call:incoming (callee) | PASS |
| call:incoming includes fromName | PASS |
| call:incoming preserves callType | PASS |
| webrtc:offer relayed to peer | PASS |
| webrtc:offer sdp preserved verbatim | PASS |
| webrtc:answer relayed back to caller | PASS |
| webrtc:ice relayed | PASS |
| call:invite to offline target → call:unavailable | PASS |
| unauthed frame rejected with error not_authed | PASS |
| unknown frame type → error unknown_type | PASS |

**WebSocket: 21/21 PASS.** Run with `node tests/ws_smoke.js` (server must be running).

> Note: actual WebRTC *media* (getUserMedia / peer connection) requires a real
> browser and cannot be exercised headlessly. The signaling relay — the server's
> entire responsibility — is fully verified. Live two-tab media is a manual browser
> step (documented in Frontend handoff §2/§3) outside this automated suite.

---

## 3. Frontend static test cases — all PASS

| Asset | Expected | Result |
|-------|----------|--------|
| GET / (index.html) | 200 text/html, real app (title "Bevane — Private chat, calls & notes"), not placeholder | PASS |
| GET /manifest.webmanifest | 200 application/manifest+json | PASS |
| GET /sw.js | 200 application/javascript | PASS |
| GET /js/app.js | 200 application/javascript | PASS |
| GET /css/styles.css | 200 text/css | PASS |
| GET /icons/apple-touch-icon.png | 200 image/png | PASS |
| GET /icons/icon-192.png | 200 image/png | PASS |
| GET /icons/icon-512.png | 200 image/png | PASS |
| GET /icons/icon.svg | 200 image/svg+xml | PASS |
| `node --check` all 11 public/js modules (as ES module) | no syntax errors | PASS |
| `node --check` public/sw.js (classic) | no syntax errors | PASS |

> The 11 `public/js/*.js` files are ES modules (loaded via `<script type="module">`).
> A naive `node --check` mis-parses them as CommonJS and reports false `export`/`import`
> errors; checking them with module input-type (matching how the browser loads them)
> passes cleanly. This is a checking-mode artifact, **not** a code defect.

---

## 4. Accessibility (WCAG 2.1 AA) — graded, see bug_tracker for any gaps

| Req | Check | Result |
|-----|-------|--------|
| A1 Landmarks / single H1 | header[role=banner], nav[aria-label=Primary], main#main; one visible h1 per view, section h2 sr-only | PASS |
| A2 Keyboard + focus | skip-link, `:focus-visible` 3px gold ring (12.98:1), tablist Arrow/Home/End w/ focus mgmt | PASS |
| A3 aria-labels on icon controls | send, voice, video, gen-note, smart-reply, back, accept, decline, mute, camera, end all labeled | PASS |
| A4 Live regions | #live-region (polite) announces new messages + call connected/ended; #alert-region (assertive) + call status announce incoming/outgoing calls — wired in chats.js/webrtc.js | PASS |
| A5 Contrast ≥4.5:1 | all 13 sampled text pairs ≥4.5 (tightest bubble-me 4.60); UI components ≥3 | PASS |
| A6 Labeled inputs / announced errors | every input/textarea has `<label>`; onboarding error role=alert + aria-invalid + focus | PASS |
| A7 Targets ≥44×44 | `--tap:44px` on btns/iconbtns/inputs/list items; call btns 64px | PASS |
| A8 No color-alone | presence dot+word, status words, active tab underlined, mute/camera aria-pressed+label | PASS |
| Reduced motion | `@media (prefers-reduced-motion: reduce)` disables transitions/animations | PASS |

**Accessibility: PASS (no AA violations found).**

---

## Summary
- REST: 42/42 PASS
- WebSocket: 21/21 PASS
- Frontend static: 11/11 assets + 12/12 syntax PASS
- Accessibility: 9/9 AA criteria PASS
- Blocking bugs: 0. See `docs/bug_tracker.md` for non-blocking observations.
