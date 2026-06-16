# Bevane — Pre-Release Checklist

**Gate owner:** QA/QC Full-Stack Agent · **Date:** 2026-06-16
**Legend:** [x] verified pass · [~] pass with caveat · [ ] failed

## Build & boot
- [x] `npm install` resolves (deps already installed: express, ws, better-sqlite3, uuid)
- [x] `node server.js` boots with one command, listens on 0.0.0.0:3000
- [x] SQLite DB + all 5 tables (`users, conversations, messages, notes, call_logs`) created idempotently on fresh DB
- [x] Static PWA served same-origin from `/public`
- [x] Server stable across full test run (no crashes / unhandled errors)

## REST API (42/42 cases pass — see tests/test_plans.md)
- [x] Users: register (1–40 char validation), list (online flags), get-one, 404s
- [x] Conversations: get-or-create idempotent per pair; self-pair & unknown-user 400s
- [x] Messages: REST send + history (ascending); empty body rejected; bad conv 404
- [x] Notes: full CRUD; updated_at-desc ordering; 204 delete; 400/404 edges
- [x] AI generate-note: source:ai, summary + actionItems, persisted; empty-conv 400
- [x] AI smart-reply: 2–4 suggestions, context-aware + generic fallback
- [x] Call logs: POST/PATCH/GET; durationSec (60 / 0 missed-declined); type/status validation
- [x] Errors: documented `{error,message}` + correct HTTP codes throughout
- [x] Unknown `/api/*` → JSON 404 (no SPA fallthrough)

## WebSocket / real-time (21/21 assertions pass — see tests/ws_smoke.js)
- [x] auth → auth:ok + presence broadcast
- [x] chat:send → chat:new to both (sender keeps clientTempId; recipient does not)
- [x] chat:status delivered (recipient online) and read (chat:read)
- [x] typing relayed to peer
- [x] WebRTC signaling: call:invite → call:incoming (+fromName, callType preserved)
- [x] webrtc:offer/answer/ice relayed verbatim (sdp/candidate preserved)
- [x] offline target → call:unavailable
- [x] unauthed frame → error not_authed; unknown type → error unknown_type

## Frontend / PWA
- [x] Server serves the REAL index.html (not placeholder)
- [x] manifest.webmanifest 200 (application/manifest+json)
- [x] sw.js 200 (service worker present)
- [x] apple-touch-icon + 192/512 PNG + SVG icons all 200
- [x] All 11 ES-module JS files + sw.js pass syntax check
- [x] iOS add-to-home meta tags + theme-color present
- [~] Installable / launches standalone / offline shell — markup + manifest + SW correct; **final on-device install confirmation is a manual browser step**

## Accessibility (WCAG 2.1 AA — 9/9 pass)
- [x] A1 Landmarks + single H1 per view
- [x] A2 Keyboard operable + visible focus (skip-link, focus-visible ring, tablist Arrow/Home/End)
- [x] A3 aria-labels on every icon control
- [x] A4 aria-live for incoming messages + incoming/outgoing calls (wired & called)
- [x] A5 Contrast ≥4.5:1 (all sampled pairs; tightest 4.60)
- [x] A6 Labeled inputs; onboarding error role=alert + aria-invalid + focus
- [x] A7 Touch targets ≥44×44 (call btns 64px)
- [x] A8 No color-alone (presence text, status words, tab underline, aria-pressed)
- [x] prefers-reduced-motion respected

## Acceptance criteria coverage (BRD §4)
- [x] Messaging AC-M1..M7 (real-time, history, typing, presence, status, empty-reject)
- [~] Voice AC-V1..V6 — signaling + logging verified; **two-tab media = manual browser confirm**
- [~] Video AC-VD1..VD6 — signaling + logging verified; **media = manual browser confirm**
- [x] Notes AC-N1..N6 (CRUD, recent-first, generate-note, offline, smart-reply, AI-labeled)

## Defects
- [x] 0 Critical / 0 High
- [x] BUG-001 (Low, cosmetic AI note title) — flagged, non-blocking
- [x] BUG-002 (node --check artifact) — not a bug
- [x] BUG-003 (headless WebRTC media) — known limitation / manual step

## Caveats carried into release
1. **WebRTC live media** must be smoke-tested once in two real browser tabs before a
   public demo (signaling is fully verified; media needs a browser + reachable path).
2. **PWA install** ("Add to Home Screen", standalone launch, offline shell) should be
   confirmed once on iOS Safari via the HTTPS URL (markup/manifest/SW are correct).
3. BUG-001 cosmetic AI-note title — fix when convenient, not release-blocking.

## VERDICT: **GO** (with the two manual-confirm caveats above)
