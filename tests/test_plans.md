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

---

# ROUND 2 (v2) — Test Plan & Results
**QA/QC Full-Stack Agent · Date: 2026-06-16 · Final quality gate**

Server: `node server.js` booted clean (DB migration additive, **no errors in log**), reused for the whole run, killed at end. All tests below executed via curl / node against `http://localhost:3000`.

## R2-A. Backend regression (v1 still passes)
| Case | Method/Path | Result |
|------|-------------|--------|
| Register user(s) | POST /api/users (Alice, Bob) | PASS (201, ids issued) |
| Get-or-create conversation | POST /api/conversations | PASS (201) |
| REST send message ×2 | POST /api/conversations/:id/messages | PASS (echoes replyTo/deleted/reactions defaults) |
| Get messages (ascending) | GET /api/conversations/:id/messages | PASS |
| Notes CRUD | POST/GET/PUT/DELETE /api/notes | PASS (204 on delete) |
| AI generate-note | POST /api/ai/generate-note | PASS (source:ai, summary, actionItems, persisted, new note fields echoed) |
| AI smart-reply | POST /api/ai/smart-reply | PASS (3 suggestions) |
| WS protocol smoke | tests/ws_smoke.js | PASS 21/21 |

## R2-B. New v2 AI endpoints (shape + 400/404 validation)
| Endpoint | Happy path | Bad input |
|----------|-----------|-----------|
| POST /api/ai/tone-adjust | PASS `{result,tone}` (formal rewrite) | 400 empty text PASS · 400 unknown tone PASS |
| POST /api/ai/translate | PASS `hola amigo gracias` `{result,targetLang,sourceLang:"auto"}` | 400 empty text PASS · 400 empty targetLang PASS |
| POST /api/ai/chat-summary | PASS `{summary,bullets}` | 404 missing conversation PASS |
| POST /api/ai/note-summarize | PASS `{summary,bullets}` | 400 empty PASS |
| POST /api/ai/smart-tags | PASS 6 tags `{tags}` | 400 empty PASS |
| POST /api/ai/action-items | PASS 3 items (checkbox/TODO/imperative) | 400 empty PASS |
| POST /api/ai/ask-about-note | PASS extractive `{answer}` | 400 empty question PASS |
| POST /api/groups | PASS 201 `{id,name,ownerId,memberIds,createdAt}` (owner auto-added) | 400 missing name PASS |
| GET /api/groups?userId | PASS for owner AND member | — |

All v2 AI endpoints are offline/deterministic (no network, no key) — confirmed by output stability.

## R2-C. Note new-field round-trip
| Case | Result |
|------|--------|
| POST note with folder/pinned/color/checklist/reminderAt | PASS — all persisted in 201 response |
| GET note | PASS — folder=Personal, pinned=1, color=#ffcc00, checklist parsed array, reminderAt epoch all returned |
| PUT locked=true + checklist update | PASS — locked=1, checklist done=true, updatedAt bumped |
| List sorts pinned-first | PASS |

## R2-D. Frontend static + integrity
| Case | Result |
|------|--------|
| Real index.html served (200, has `<title>`) | PASS |
| manifest.webmanifest 200 | PASS |
| sw.js 200 | PASS |
| sw.js cache constant = `bevane-shell-v3` | PASS |
| sw.js SHELL includes profile.js, groups.js, reactions.js, ai-tools.js, vendor/qrcode.js | PASS |
| `node --check --input-type=module` for all 16 public/js + vendor files | PASS 16/16 |
| Every named import resolves to a real export (script-verified) | PASS (0 unresolved) |

## R2-E. Black-screen / overlay audit (the regression that bit the user)
| Check | Result |
|-------|--------|
| `[hidden] { display: none !important; }` present in styles.css (line 34) | PASS |
| It is the ONLY `!important` display rule — nothing can defeat it | PASS |
| No CSS selector for #splash/#onboarding/#call-overlay/.modal/#attach-sheet sets display while [hidden] | PASS |
| #onboarding, #peer-picker, #attach-sheet, #group-dialog, #qr-dialog, #editname-dialog, #call-overlay have `hidden` attr in index.html | PASS |
| Dynamically-created reaction/action sheet (#msg-action-sheet) created with `hidden:true` | PASS |
| #splash shown on load, hidden by JS in `boot()` (`hideSplash()`) | PASS |
| `boot().catch()` safety path also calls `hideSplash()` (never stuck) | PASS |

**Result: NO black-screen / overlay-hijack risk. On load: splash → onboarding → app shell (Chats).**

## R2-F. Dead-button audit (graded — user's explicit complaint)
72 static `<button>`/tab controls + all dynamically-created buttons enumerated and traced.
- **Real handler:** all working controls (send=submit, tabs via `.tab` initTabBar, thread voice/video/search/summary/gennote/tone/smart-reply, note pin/lock/folder/reminder/checklist/color/AI×5, call accept/decline/mute/camera/switchcam/end, profile qr/editname/logout, groups create, peer picker, etc.)
- **comingSoon():** 28 stub routes (media attach, unsend, forward, speaker/hold/add-participant/switch-video/PiP, grammar/richtext/image/voice/export note, scan-QR/avatar/password, notif toggles, group messaging).
- **UNWIRED with no feedback: 0.**

**Result: NO dead buttons.** (Bonus: profile-qr-btn, listed as a stub in the handoff, is actually now a *working* QR generator via bundled vendor/qrcode.js, with comingSoon fallback.)

## R2-G. Accessibility (WCAG AA) spot-check — new UI
| Area | Result |
|------|--------|
| Profile icon controls (qr/scanqr/avatar/editname/password/logout) aria-labeled or visible text | PASS |
| Notification toggles labeled (visible `<span>` in `<label>` + data-label announce) | PASS |
| Folder tabs role=tab + aria-selected + aria-label | PASS |
| Group-create dialog role=dialog, aria-modal, aria-labelledby, focus handling | PASS |
| In-call controls aria-label + aria-pressed (mute/camera) | PASS |
| Reaction/action sheet role=dialog, per-emoji aria-label, focus + close | PASS |
| Live-region announcements (comingSoon, presence, typing, call status) | PASS |
| ≥44px targets (`--tap:44px`; call btns 64px) | PASS |
| Contrast (text ~16:1, muted ~8:1 on --bg) | PASS |

**Accessibility: PASS (no AA violations in the new UI).**

## v2 Summary
- Backend regression: PASS (REST + 21/21 WS)
- New v2 endpoints: 9/9 PASS (7 AI + 2 groups) incl. all 400/404 validations
- Note new-field round-trip: PASS
- Frontend static/integrity: PASS (16/16 syntax, all imports resolve, sw.js v3)
- Black-screen audit: PASS (no overlay can cover the app)
- Dead-button audit: PASS (0 unwired; ~28 comingSoon stubs; rest real handlers)
- Accessibility: PASS
- Blocking defects: 0

---

# ROUND 3 — Web App Conversion (responsive + iOS removal)

**Date:** 2026-06-16 · **Build:** `main` (Round-3 conversion) · server `node server.js` :3000
**Verified against:** `docs/web_app_conversion.md`, `docs/business_requirements.md` §2
(AC-GLOBAL-RESPONSIVE, AC-GLOBAL-PERSIST), handoffs 09/10/11.

> Scope note: responsive layout audited **statically + structurally** (DOM, CSS media
> queries, breakpoint-aware JS). No headless browser was used; a real-browser/device
> pass is the one carried caveat. Backend was unchanged this round.

## C-R3-01 Boot
| Step | Result |
|------|--------|
| Deps present (`node_modules`), no reinstall needed | PASS |
| `node server.js` boots, listens 0.0.0.0:3000, clean log (HTTP+WS, SQLite, static) | PASS |
| `GET /` 200, `GET /sw.js` 200 shows `bevane-shell-v4` | PASS |

## C-R3-02 Backend regression (curl, end-to-end)
| Case | Result |
|------|--------|
| Register 2 users (`POST /api/users` ×2) → 201 + ids | PASS |
| Open conversation (`POST /api/conversations`) → 201 + id | PASS |
| Send 3 messages (`POST /messages`) → 201 ×3 | PASS |
| GET messages → count=3, order `Hi Bob / Hey Alice / How are you?` | PASS |
| Notes CRUD: create → update (200) → list (title `Groceries v2`) | PASS |
| AI `tone-adjust` (formal) → formatted result | PASS |
| AI `action-items` → array | PASS |
| AI `smart-reply` → 3 suggestions | PASS |
| AI `generate-note` (ownerId+conversationId) → 201 AI note | PASS |
| Call log: create completed → list count=1 | PASS |
| Error shapes (400 missing_params; JSON 404 on bad `/api/*`); SPA fallback 200 | PASS |
| WS smoke (`tests/ws_smoke.js`) | **21/21 PASS** |

## C-R3-03 PERSISTENCE (AC-GLOBAL-PERSIST) — re-verified by QC
Seeded conv+messages+note+AI note+call; **`kill -9`** the server; new process booted
on the same `data/bevane.db` (WAL).

| Metric | BEFORE | AFTER (new process) |
|--------|--------|---------------------|
| SQLite users | 15 | 15 |
| SQLite conversations | 7 | 7 |
| SQLite messages | 10 | 10 |
| SQLite notes | 7 | 7 |
| SQLite call_logs | 3 | 3 |
| REST conversations(Alice) | `[{peer:QC_Bob, last:"How are you?"}]` | identical |
| REST messages | `["Hi Bob","Hey Alice","How are you?"]` | identical |
| REST notes(Alice) | 3 | 3 (identical titles) |
| REST calls(Alice) | 1 | 1 |

**Result: PASS — data identical across a hard (`kill -9`) restart.**

## C-R3-04 iOS removal (AC-F4)
| Check | Result |
|-------|--------|
| `apple-mobile-web-app-capable` / `-status-bar-style` / `-title` gone | PASS |
| `maximum-scale` gone (no zoom lock) | PASS |
| `viewport-fit=cover` gone | PASS |
| Viewport = `width=device-width, initial-scale=1.0` (zoom allowed) | PASS |
| `apple-touch-icon` present only as harmless extra | PASS |
| `manifest.webmanifest` — no `orientation`/apple/ios tokens | PASS |
| `webrtc.js` — no iOS-only wording | PASS |

## C-R3-05 Responsive layout (AC-F5 / AC-GLOBAL-RESPONSIVE) — static + structural
| Check | Result |
|-------|--------|
| index.html has BOTH sidebar nav (`.sidenav`) and mobile tab bar (`.tab`), both `data-view` | PASS |
| Both nav groups drive the same `showView()` (app.js `wireNavGroup`) | PASS |
| Base (mobile): `.sidebar{display:none}`, `.tabbar` visible | PASS |
| @768px: sidebar `display:flex` (icon rail), `.tabbar{display:none}`, Chats `flex-direction:row` two-pane | PASS |
| @1024px: sidebar 232px with labels; Notes two-pane (list \| editor) | PASS |
| `chats.js openThread`: shows thread, adds `has-thread`, hides list **only `if(!isTwoPane())`** | PASS |
| `notes.js openEditor`: same pattern with `has-editor` | PASS |
| `app.js onTwoPaneChange`: re-reveals list pane entering two-pane; re-hides leaving — no stuck/blank pane | PASS |
| `updateBackButton`: Back hidden in two-pane, shown only on mobile sub-pane | PASS |
| No CSS logic path blanks the content area at any breakpoint | PASS |

## C-R3-06 Black-screen / overlay audit
| Check | Result |
|-------|--------|
| `[hidden]{display:none!important}` present (styles.css:34) | PASS |
| `#splash`/`#onboarding`/`#call-overlay`/`.modal`/`#attach-sheet` `hidden` until invoked | PASS |
| No other `display:…!important` rule defeats `[hidden]` | PASS |
| `boot()` hides splash and has `.catch(hideSplash)` | PASS |
| New sidebar / `#thread-empty` shown by CSS only (can't stick) | PASS |

## C-R3-07 Dead-button audit
| Group | Count | Status |
|-------|-------|--------|
| Interactive `<button>` (index.html) | 63 | all wired |
| Nav (`.tab`×4, `.sidenav`×4, `#side-me`) | 9 | `showView()` via data-view |
| `data-attach` chips | 6 | → `comingSoon()` |
| `call-filter` tabs | 4 | real filter handler |
| `notif-toggle` checkboxes | 3 | → `comingSoon()` |
| Form submit buttons (message/note/group/editname/onboarding) | 5 | form submit handlers |
| Dynamic folder tabs | — | wired in notes.js |
| **UNWIRED** | **0** | — |

**Result: PASS — 0 silent dead buttons.**

## C-R3-08 Integrity
| Check | Result |
|-------|--------|
| `node --check --input-type=module` on all 16 `public/js/*.js` + `vendor/qrcode.js` | PASS |
| All named imports resolve to exports (incl. `isTwoPane`/`onTwoPaneChange`, `toCanvas`) | PASS |
| `sw.js` cache `bevane-shell-v4`; SHELL lists all assets incl. `ai-tools.js` | PASS |

## C-R3-09 Accessibility spot-check (sidebar + two-pane)
| Check | Result |
|-------|--------|
| Sidebar `nav[aria-label="Primary"]`, `role=tablist`, `role=tab`, `aria-selected`, `aria-controls`, roving tabindex | PASS |
| Up/Down/Home/End arrow nav (sidebar) + Left/Right (tab bar) | PASS |
| Active destination = inset bar + bold + bg (not color alone) | PASS |
| Skip-link, `role=banner`, `<main>`, `aria-live` regions preserved | PASS |
| No zoom lock | PASS |
| `:focus-visible` present | PASS |
| Panels `<section class=view>` not `role=tabpanel` (minor; see OBS-R3-001) | PASS (minor) |

## v3 Summary
- Boot + backend regression: PASS (REST + 21/21 WS)
- **Persistence (AC-GLOBAL-PERSIST): PASS** — identical across `kill -9` restart
- iOS removal (AC-F4): PASS
- Responsive layout (AC-F5): PASS (static + structural; real-browser pass is caveat)
- Black-screen audit: PASS
- Dead-button audit: PASS (0 unwired)
- Integrity: PASS (17/17 parse, imports resolve, sw v4)
- Accessibility: PASS (1 minor observation, non-blocking)
- Blocking defects: 0
