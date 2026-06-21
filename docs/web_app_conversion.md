# Bevane — Web App Conversion Spec (v3)

**Author:** Business Analyst Agent · **Date:** 2026-06-16 · **Version:** 1.0
**Status:** Focused conversion spec for Round 3 (mostly Frontend; small Backend verification)

This is the focused, concrete spec for converting Bevane from its "mobile/iOS-PWA"
framing into a **general, responsive Web Application** for desktop and mobile
browsers. It is a companion to `business_requirements.md` §2.

> **Anchor reality:** Bevane is *already* a web app — Node/Express + `ws` + SQLite
> backend, vanilla-JS frontend in `/public`. There is **no native iOS/Swift code**.
> "Converting from iOS" = removing iOS-PWA-specific bits and making the layout a
> clean, responsive, cross-browser website. **This is not a rewrite.** No new
> features; the API contract (`backend/api_specs.md`) is unchanged.

---

## (a) iOS-specific things to REMOVE or generalize

These live in `public/index.html`, `public/css/styles.css`, the manifest, and a
few comments. Each item: what it is today, and the target.

| # | iOS-specific item (today) | Where | Action |
|---|----------------------------|-------|--------|
| 1 | `<meta name="apple-mobile-web-app-capable" content="yes">` | index.html | **Remove.** (Optionally replace with the standard `<meta name="mobile-web-app-capable" content="yes">`.) |
| 2 | `<meta name="apple-mobile-web-app-status-bar-style" ...>` | index.html | **Remove.** |
| 3 | `<meta name="apple-mobile-web-app-title" content="Bevane">` | index.html | **Remove** (manifest `name`/`short_name` covers this). |
| 4 | `<link rel="apple-touch-icon" href="/icons/apple-touch-icon.png">` | index.html | **Optional to keep** as a harmless extra, but it must **not** be the only/primary install icon. The manifest `icons` (192/512, maskable) are canonical. Do not depend on `apple-touch-icon`. |
| 5 | `maximum-scale=1.0` in the viewport meta | index.html | **Remove** the scale lock — it blocks pinch-zoom and harms accessibility (WCAG). Keep `width=device-width, initial-scale=1.0`. |
| 6 | `viewport-fit=cover` + `env(safe-area-inset-*)` used to *shape the whole app as a phone* | index.html / styles.css | **Generalize.** Safe-area padding may remain as a defensive nicety on mobile, but it must **not** drive the desktop layout or force an iPhone-shaped centered column. The desktop layout is sidebar + content, full-width. |
| 7 | iPhone-shaped **centered single-column** frame (the whole UI rendered as a phone-width column even on wide screens) | styles.css | **Replace** with the responsive layout in (b). Desktop = full-width sidebar + content. |
| 8 | `<video playsinline>` documented as an "iOS Safari" requirement | index.html / ARCHITECTURE.md | **Keep `playsinline`** (it is harmless and correct in all browsers) but **re-document** it as standard cross-browser inline video, not an iOS-only workaround. |
| 9 | iOS-only WebRTC comments/assumptions (e.g. "satisfies the iOS user-gesture requirement", "iOS Safari does not support getDisplayMedia") | webrtc.js comments / docs | **Generalize** wording. User-gesture-before-getUserMedia is good cross-browser practice; keep it but stop framing it as iOS-only. Screen share is now feasible on desktop. |
| 10 | Any **"Add to Home Screen on iOS"** / Share-sheet onboarding copy | index.html / onboarding | **Generalize or remove.** If install is mentioned at all, say "install / add to your device" generically. Installability via manifest stays; it is no longer iOS-targeted. |
| 11 | `apple-touch-icon.png` listed as a **load-bearing** asset in SW precache / ARCHITECTURE | sw.js / ARCHITECTURE.md | Keep caching it if present (harmless), but documentation must not present it as required. |

**Server-side iOS specifics:** none expected. The server is host/origin-agnostic
(binds `0.0.0.0`, respects `process.env.PORT`, derives WS host from the request).
Backend's job is to **verify** this and confirm there is nothing iOS-specific to
remove server-side. See `communication-history/09_BA_to_Backend_v3.md`.

---

## (b) Target responsive layout (concrete)

The **same four destinations** — Chats / Calls / Notes / Profile — render
differently by viewport. Three breakpoints:

### Desktop — `≥ 1024px`
```
┌──────────┬───────────────────────────────────────────────┐
│          │  Chats (two-pane)                              │
│ SIDEBAR  │  ┌──────────────┬──────────────────────────┐   │
│  Chats ● │  │ Conversation │  Open thread             │   │
│  Calls   │  │ list         │  (messages + composer)   │   │
│  Notes   │  │ (peers,      │                          │   │
│  Profile │  │  last msg)   │  header: search/call/vid │   │
│          │  │              │                          │   │
│  [me]    │  └──────────────┴──────────────────────────┘   │
└──────────┴───────────────────────────────────────────────┘
```
- **Persistent left sidebar** with the four destinations + the current user. Active
  destination is visually indicated (not by color alone).
- **Chats = two-pane:** conversation **list pane** | **thread pane** side-by-side.
  Selecting a conversation opens it in the thread pane **without leaving the list**.
  An empty-state ("Select a conversation") shows when no thread is open.
- **Calls / Notes / Profile:** sidebar + a content area (Notes may itself be
  two-pane: notes list | editor — recommended, same pattern as chat).
- **Call overlay** (voice/video) is centered/modal over the content, sized for
  desktop (not a phone-width strip); video uses available width.
- Full-width chrome; **no iPhone-shaped column**.

### Tablet — `768px – 1023px`
- Sidebar may collapse to an **icon rail** (icons + labels on hover/focus) or stay
  full if width allows.
- Chats may be **two-pane** if width permits, otherwise list→thread.
- Graceful in-between; no hard requirement beyond "reflows cleanly".

### Mobile — `< 768px`
```
┌───────────────────────────────┐
│  header (title / back)        │
│                               │
│      single-column view       │
│   (list  OR  open thread)     │
│                               │
├───────┬───────┬───────┬───────┤
│ Chats │ Calls │ Notes │ Prof. │   ← bottom tab bar
└───────┴───────┴───────┴───────┘
```
- **Single column.** Primary nav is a **bottom tab bar** (current behavior) — a
  hamburger drawer is an acceptable alternative, but bottom tabs are preferred.
- **Chats:** list → tap → full-screen thread with a **Back** button (current
  behavior). The two-pane desktop view collapses to this.

### Implementation guidance (no app code here)
- Drive layout with **CSS media queries / container queries**; the same DOM should
  reflow. Avoid JS-forked layouts where CSS suffices.
- Reference breakpoints: `--bp-desktop: 1024px`, `--bp-tablet: 768px` (final values
  live in `styles.css` / `Frontend/ARCHITECTURE.md`).
- The bottom tab bar (mobile) and the sidebar (desktop) are the **same logical nav**
  (`role="tablist"`/`tab` semantics preserved) — show one per breakpoint.

---

## (c) Accessibility expectations (desktop + mobile)

Builds on `business_requirements.md` §7 (WCAG 2.1 AA). Desktop-specific:

- **Keyboard navigation:** every destination, conversation, message action, and call
  control is reachable and operable by keyboard. Logical Tab/Shift-Tab order:
  sidebar → list pane → thread pane → composer. Arrow-key navigation **within** the
  conversation list and the sidebar is recommended.
- **Focus management:** visible `:focus-visible` ring everywhere; a skip-link to
  main content. When a conversation is selected in two-pane mode, focus moves into
  the thread (composer or first new message) sensibly. Modals (peer picker, call
  overlay) trap focus and restore it to the trigger on close.
- **Landmarks:** `header[role=banner]`, `nav[aria-label="Primary"]` (the sidebar /
  tab bar), `main`. One visible `h1` per view.
- **No zoom lock:** pinch/zoom and browser zoom must work (item (a)#5).
- **Hit areas:** ≥ 44×44px on mobile; desktop pointer targets at least platform
  default (larger optional). Two-pane panes must not produce overlapping/clipped
  controls at any supported width.
- **State not by color alone:** active destination, presence, message status, call
  status all carry text/icon, on both sidebar and tab bar.
- **Live regions:** new incoming messages, incoming calls, and "Coming soon" stub
  feedback announced via `aria-live`, identically across layouts.

---

## (d) Persistence guarantees (explicit, testable)

**All conversations and user data are persisted in SQLite and survive server
restart, browser reload, and WebSocket reconnect.**

Persisted entities (already backed by SQLite — Backend to verify & document):
- **Messages** — `GET /api/conversations/:id/messages` re-lists every message after reload.
- **Conversations** — `GET /api/conversations?userId=` re-lists the conversation list after reload.
- **Notes** — `GET /api/notes?ownerId=` re-lists after reload.
- **Call logs** — `GET /api/calls?userId=` re-lists after reload.
- **Users** — persisted server-side; client `id` in `localStorage`.

**Acceptance test (binding):**
1. As user A, send several messages to user B; create a note; complete a voice call.
2. **Stop and restart the Node server** (`data/bevane.db` is on disk).
3. **Reload both browsers.**
4. The conversation, all messages (same order/content), the note, and the call log
   all reappear. The WebSocket **reconnects** (`wss` through the tunnel) and live
   chat resumes.
5. Querying `data/bevane.db` directly (e.g. `sqlite3 data/bevane.db "select count(*) from messages"`)
   shows the rows. Backend documents the table/row evidence in
   `10_Backend_to_Frontend_v3.md`.

---

## Delivery — bevane.loca.lt

- The app is served over HTTPS at **https://bevane.loca.lt** (localtunnel,
  `--subdomain bevane`, pointing at the running Node server on `process.env.PORT`).
- **Same-origin:** all of `/`, `/api/*`, and `/ws` are served from this origin —
  **no CORS configuration needed** as long as the frontend is served by the same
  server (it is).
- **WebSocket:** the client derives `wss://bevane.loca.lt/ws` from `location`
  (`wss` because the page is HTTPS). The WS **upgrade must pass through the tunnel
  proxy**. Backend verifies this works end-to-end.
- No host/port is hardcoded anywhere; the client uses relative `/api/...` and
  `location.host` for the socket.

---

## Out of scope for this conversion

- New features (catalog is frozen — see `business_requirements.md` §5).
- Framework migration / rewrite (stay vanilla JS).
- Real auth, encryption, group media relay, ML media.
- Native iOS/Swift (never existed; not happening).
