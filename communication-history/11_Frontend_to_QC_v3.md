# 11 — Frontend Developer → QA/QC Agent (Round 3 handoff)

- **From:** Frontend Developer Agent
- **To:** QA/QC Full-Stack Agent
- **Date:** 2026-06-16
- **Subject:** Round-3 **web app conversion** ready for the quality gate — iOS-PWA
  framing removed; responsive redesign (desktop sidebar + two-pane / mobile bottom
  tabs + single column). **Layout + cleanup only — no feature logic was rewritten.**

## Summary

This round converted Bevane from its "mobile/iOS-PWA" framing into a clean,
responsive, cross-browser website (Chrome/Firefox/Safari/Edge, desktop + mobile).
The work was **CSS-driven over the same DOM** with minimal, breakpoint-aware JS.
No new features, no API changes (`backend/api_specs.md` is frozen — Backend
confirmed origin-agnostic + persistent in `10_Backend_to_Frontend_v3.md`).

Two things were done:
1. **Stripped iOS specifics** (meta tags, zoom lock, viewport-fit, phone-column
   framing, iOS-only comments/copy).
2. **Responsive redesign:** desktop = persistent left **sidebar** + **two-pane**
   Chats (list | thread) and Notes (list | editor); tablet = sidebar icon-rail +
   two-pane chat; mobile = **single column + bottom tab bar** (unchanged behavior).

## TWO guarantees you must verify (the user was burned by these in prior rounds)

1. **No black screen / overlay hijack.** `[hidden] { display: none !important; }`
   (line 34 of `public/css/styles.css`) is **intact**. On load: **splash →
   onboarding → app shell (Chats)**. `#call-overlay`, `#onboarding`, `#splash`,
   `.modal`, `#attach-sheet`, the reaction sheet stay invisible unless invoked.
   `boot()` still has the safety `.catch()` that always hides the splash. The new
   desktop sidebar and the new `#thread-empty` placeholder do not use `[hidden]`;
   they are shown/hidden purely by media queries, so they cannot stick.
2. **No silent dead buttons.** Every non-functional control still routes to
   `comingSoon()`. The only controls added this round are the 4 sidebar nav buttons
   (`.sidenav`) + the sidebar "me" button (`#side-me`) + a brand link to `#main` —
   all have real handlers (they route through the same `showView()` as the tab bar).

## What changed (files)

- **`public/index.html`** — removed iOS meta tags; relaxed viewport (no zoom lock,
  no `viewport-fit=cover`); added the desktop `.sidebar` nav and an `.app__content`
  wrapper around header+main+tabbar; added a `#thread-empty` two-pane placeholder.
  apple-touch-icon kept as a harmless extra only.
- **`public/css/styles.css`** — `.app` is no longer a 540px centered phone column;
  it's a flex row (sidebar | content). Added sidebar styles, two-pane Chats/Notes
  layout, active-conversation highlight, and the responsive media-query block
  (`768px` tablet, `1024px` desktop). `[hidden]` rule untouched.
- **`public/js/ui.js`** — added `isTwoPane()` (live `matchMedia(min-width:768px)`)
  and `onTwoPaneChange(fn)`.
- **`public/js/chats.js`** — `openThread`/`closeThread` are two-pane aware: they add
  a `has-thread` class and **only hide the conversation list when `!isTwoPane()`**.
  Open conversation gets `.conversation-item--active`. Mobile behavior identical.
- **`public/js/notes.js`** — `openEditor`/`closeEditor` same pattern with
  `has-editor` (desktop keeps the notes list visible beside the editor).
- **`public/js/app.js`** — `showView()` syncs **both** the bottom tab bar and the
  sidebar; `initNav()` wires both nav groups (tab bar Left/Right, sidebar Up/Down)
  and an `onTwoPaneChange` handler that re-reveals/re-hides the list pane on
  breakpoint crossing (resize / devtools device mode). `updateBackButton()` hides
  the Back button in two-pane mode.
- **`public/js/profile.js`** — display-name edit also updates the sidebar name.
- **`public/js/webrtc.js`** — iOS-only comment generalized to cross-browser wording.
- **`public/manifest.webmanifest`** — dropped the phone-only `orientation: portrait`.
- **`public/sw.js`** — cache bumped `bevane-shell-v3` → **`bevane-shell-v4`** (SHELL
  list unchanged; no new asset files were created).
- **`Frontend/ARCHITECTURE.md`** — documents the responsive layout, breakpoints,
  and iOS removals.

## How to test

### Desktop (≥ 1024px) — sidebar + two-pane
1. Open the app in a wide desktop browser window (or devtools responsive mode set ≥1024px).
2. Confirm a **persistent left sidebar** (Chats / Calls / Notes / Profile + your
   name at the bottom) instead of a bottom tab bar. No iPhone-shaped centered column.
3. Click **Chats**: the conversation **list and the thread are both visible**
   side-by-side. With no thread open, the right pane shows
   "Select a conversation to start chatting." Selecting a conversation opens it in
   the right pane **without** the list disappearing; the selected item is highlighted.
4. Click **Notes**: list | editor two-pane; opening/creating a note keeps the list visible.
5. Keyboard: Tab reaches the sidebar; **Up/Down arrows** move between destinations;
   Enter/Space activates. `:focus-visible` ring is visible. Skip-link works.

### Tablet (768–1023px)
- Sidebar collapses to an **icon rail** (icons only); bottom tab bar is hidden;
  Chats stays two-pane. Reflows cleanly.

### Mobile (< 768px) — single column + bottom tabs
1. Narrow the window / devtools device mode (e.g. iPhone/Pixel).
2. Confirm the **bottom tab bar** (sidebar hidden), single column.
3. Chats: list → tap a conversation → **full-screen thread with a Back button**;
   Back returns to the list. Notes editor behaves the same. **This is identical to
   the prior mobile behavior.**
4. Resize between mobile and desktop **while a thread/note is open** — the list pane
   re-appears/re-hides appropriately (no stuck/blank pane).

### Cross-cutting
- **No black screen:** on first load splash → onboarding (name) → Chats. No overlay
  is visible until invoked. Reload mid-session: app returns to Chats, no overlay.
- **No dead buttons:** audit every `<button>`/`[role=tab]`. Stubs still toast +
  announce "… coming soon".
- **Persistence (AC-F3):** history loads from the backend on load — send messages,
  create a note, complete a call; restart the Node server; reload both browsers;
  everything reappears via `GET /api/conversations|/messages|/notes|/calls` and the
  socket reconnects (`wss` through the tunnel). The client re-fetches on
  load/reconnect; nothing depends on in-memory state except live presence (correct).
- **Origin-agnostic (AC-F1/F2):** no hardcoded host/port; REST is relative
  `/api/...`, socket is `${wss|ws}://${location.host}/ws`. Works at
  `https://bevane.loca.lt`.

## iOS removals — proof points to re-verify (AC-F4)

Grep `public/index.html`:
- `apple-mobile-web-app-capable`, `apple-mobile-web-app-status-bar-style`,
  `apple-mobile-web-app-title` → **gone**.
- `maximum-scale` → **gone** (viewport is `width=device-width, initial-scale=1.0`;
  pinch/zoom works).
- `viewport-fit=cover` → **gone**.
- `apple-touch-icon` is present **only** as a harmless extra (manifest icons are
  canonical; the app does not depend on it).
- Manifest has no iOS-targeting; no "Add to Home Screen on iOS" copy remains.

## Accessibility additions (AC-F6)

- Sidebar is a `nav[aria-label="Primary"]` with `role=tablist`/`tab`,
  `aria-selected`, roving `tabindex`, `aria-controls`, and **Up/Down/Home/End**
  arrow nav. The mobile tab bar (`nav[aria-label="Primary (mobile)"]`) keeps
  Left/Right. Both route through `showView()` so they stay in sync.
- Active sidebar destination + open conversation are indicated by **inset left bar +
  bold + background**, not color alone.
- Two-pane empty state is `aria-hidden` filler; `h1` per view, landmarks, skip-link,
  `:focus-visible`, and live regions are preserved. No zoom lock.
- Mobile touch targets remain ≥ 44px (`--tap`).

## Verification performed (before this handoff)

- `node server.js` booted clean; `/` (200, updated index served), `/manifest.webmanifest`
  (200), `/sw.js` (200, shows `bevane-shell-v4`), `/css/styles.css` (200).
- `node --check --input-type=module` on **all 15** `public/js/*.js` + `vendor/qrcode.js`
  → all pass.
- All named imports resolve to exports (incl. new `isTwoPane`/`onTwoPaneChange` from
  `ui.js`).
- Greps confirmed the iOS meta tags + `maximum-scale` + `viewport-fit` are gone, and
  `[hidden] { display: none !important; }` is present.
- `index.html` `<div>` tags balanced (55/55).
- Server killed after verification.

## QC acceptance criteria (Round 3)

- **AC-F1** Origin-agnostic client: no hardcoded host/port; relative REST; socket from `location`.
- **AC-F2** `wss` end-to-end through the tunnel: auth → chat round-trip + receipts; live presence/typing.
- **AC-F3** Persistence on server restart + browser reload (conversation, messages in order, note, call log) via REST; socket reconnects.
- **AC-F4** No iOS framing: all §3 items removed/generalized; no zoom lock; manifest icons canonical; no phone-column on desktop.
- **AC-F5** Responsive: desktop sidebar + two-pane chat; tablet reflows; mobile single column + bottom tabs — same DOM, CSS-driven.
- **AC-F6** Accessibility: keyboard nav across destinations + composer; `:focus-visible`; skip-link; landmarks; one `h1`/view; state not by color alone; `aria-live` for incoming messages/calls.
- **AC-F7** No contract drift: no API change expected.
- **Regression gates:** no black screen / overlay hijack; no silent dead buttons.

— Frontend
