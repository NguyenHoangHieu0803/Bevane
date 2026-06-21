# Bevane Frontend — Architecture

Responsive, cross-browser vanilla-JS Progressive Web App (Chrome/Firefox/Safari/Edge,
desktop + mobile). **No build step** — every file under `/public` is served statically,
same-origin, by the existing Node server. JS is authored as native ES modules
(`<script type="module">`); the browser loads them directly.

> **Round 3 (web app conversion):** the UI is now a clean responsive website rather
> than a phone-shaped column. Desktop renders a persistent left **sidebar** + a
> two-pane Chats (list | thread) and two-pane Notes (list | editor); mobile keeps
> the single-column + **bottom tab bar** experience. iOS-PWA-specific framing was
> removed (see "iOS removals" below). The layout is driven by CSS media queries
> over the **same DOM**; JS changes are minimal and breakpoint-aware.

## File structure

```
public/
├── index.html               # App shell: splash, onboarding, desktop sidebar + 4 views (Chats/Calls/Notes/Profile), mobile bottom tab bar, call overlay, dialogs
├── manifest.webmanifest      # Standard PWA manifest (name Bevane, standalone, theme, icons) — cross-browser, not iOS-targeted
├── sw.js                     # Service worker — caches app shell for offline launch (cache: bevane-shell-v4)
├── css/
│   └── styles.css            # All styles (CSS custom properties; AA contrast tokens) + responsive media queries. NOTE: `[hidden]{display:none!important}` is load-bearing — keep it.
├── icons/
│   ├── icon.svg              # Scalable logo (referenced by manifest + favicon)
│   ├── icon-192.png          # PWA icon
│   ├── icon-512.png          # PWA icon (also used as maskable)
│   └── apple-touch-icon.png  # Optional extra icon (cached harmlessly; the app does NOT depend on it — manifest icons are canonical)
└── js/
    ├── app.js                # Entry point: splash→boot, onboarding gate, navigation, SW registration
    ├── state.js              # Shared state + localStorage identity + tiny pub/sub event bus
    ├── api.js                # REST client (fetch wrapper, ApiError) — incl. all v2 AI + groups endpoints
    ├── ws.js                 # WebSocket transport: wss-derivation, auth, reconnect, frame fan-out
    ├── ui.js                 # DOM helpers, live-region announce, toast, formatters, uuid, comingSoon()
    ├── onboarding.js         # First-launch registration (POST /api/users)
    ├── chats.js              # Messaging: list, thread, send/receive, typing, read, search, reply, smart-reply, AI tone/summary/translate, attach sheet (stubs)
    ├── reactions.js          # Message reaction sheet + reply/delete/unsend(stub)/forward(stub)
    ├── webrtc.js             # Voice + video calling (signaling, mute/end working; speaker/hold/PiP/switch-to-video stubs)
    ├── calllog.js            # Combined voice+video call log (GET /api/calls), missed/received/dialed
    ├── notes.js              # Notes CRUD + folders/pin/search/color/checklist/reminder + AI summarize/tags/action-items/ask
    ├── groups.js             # Create group (POST /api/groups) + list; group messaging stubbed
    ├── profile.js            # Profile tab: name, log out (working); QR/scan/avatar/password/notif (stubs)
    ├── peerpicker.js         # Modal to choose a peer for chat/voice/video
    └── vendor/
        └── qrcode.js         # Bundled QR generator (available for the personal-QR feature)
```

## Round 2 — feature status & "no dead buttons" rule

Navigation matches the BA flow: bottom tabs are **Chats / Calls / Notes / Profile**; video is folded into Calls and launched from a chat/call. A **splash screen** shows on launch and is hidden by `boot()` (with a safety `.catch()` so it never sticks).

Every control that is not yet functional calls **`comingSoon(label)`** (in `ui.js`) — it shows a toast and announces via the live region. There are **no silent dead buttons**. Functional-vs-stub status per feature is documented in `communication-history/07_Frontend_to_QC_v2.md` and `docs/business_requirements.md` (tagged [WORKING]/[STUB]/[ROADMAP]).

## Data flow

Feature modules never call each other directly. They communicate through a tiny
**pub/sub bus** in `state.js` (`on` / `emit`). This keeps modules decoupled and
lets `ws.js` broadcast every server frame by its `type`.

```
                    ┌──────────────┐
   REST  ──────────▶│   api.js     │◀────────── feature modules (await api.x())
                    └──────────────┘
                    ┌──────────────┐   emit(frame.type, frame)
   WebSocket ──────▶│   ws.js      │──────────▶  event bus (state.js)
                    └──────────────┘                 │
                                                      ▼  on('chat:new'), on('call:incoming'), …
                                          chats.js / webrtc.js / calllog.js / notes.js
```

- **Identity:** `state.js` reads/writes `localStorage` (`bevane.userId`,
  `bevane.displayName`). `app.js` gates the app behind `ensureRegistered()`.
- **Navigation:** `app.js` owns view switching via `showView()`. The bottom tab
  bar (`.tab`, mobile) and the desktop sidebar (`.sidenav`, desktop/tablet) are the
  **same logical nav** — `showView()` keeps both in sync (`aria-selected`, roving
  `tabindex`); CSS shows one per breakpoint. Each view is a `<section>`; only one is
  visible. Sub-panes (chat thread, note editor) toggle a Back button in the header
  **on mobile only** (in two-pane mode both panes are visible, so the Back button
  stays hidden — see `updateBackButton()`).

## WebSocket wiring (`ws.js`)

1. URL derived from `location`: `wss` when the page is HTTPS, else `ws` →
   `${proto}://${location.host}/ws`. No host hardcoding.
2. On open, immediately sends `{ type:'auth', userId }`. Frames sent before
   `auth:ok` are **queued** and flushed once authenticated.
3. Every inbound frame is re-emitted on the bus under its own `type`
   (`chat:new`, `chat:status`, `typing`, `presence`, `call:incoming`,
   `webrtc:offer/answer/ice`, `call:accept/decline/end/cancel/unavailable`,
   `error`).
4. Auto-reconnect with backoff on close; re-authenticates on reconnect.

### Messaging specifics
- Optimistic send: a `clientTempId` (UUID) is generated; the bubble renders
  immediately as **Sent**. The server's `chat:new` echo (carrying the same
  `clientTempId`) reconciles the bubble; `chat:status` advances it to
  **Delivered** → **Read**.
- `chat:read` is sent when a thread is opened/viewed.
- Typing: throttled `typing true` on input, debounced `typing false` after idle.

## WebRTC wiring (`webrtc.js`)

- Single `RTCPeerConnection` per call, configured with the Google STUN server
  `stun:stun.l.google.com:19302`.
- **Caller:** `getUserMedia` → create PC → `createOffer`/`setLocalDescription`
  → send `call:invite` + `webrtc:offer`. On `webrtc:answer` sets remote desc.
- **Callee:** on `call:incoming` shows the overlay with Accept/Decline. The
  offer that arrives before Accept is **buffered** and applied after the user
  grants media (invoking `getUserMedia` behind a user gesture is good
  cross-browser practice — not an iOS-only workaround). On Accept:
  `getUserMedia` → PC → `setRemoteDescription(offer)` → `createAnswer` →
  send `call:accept` + `webrtc:answer`.
- ICE candidates relayed via `webrtc:ice` both ways.
- In-call controls toggle `track.enabled` (mute mic, camera on/off). Hang up
  sends `call:end` (or `call:cancel` if still ringing), stops tracks, closes PC.
- **Call logging:** the caller always writes `POST /api/calls` at end-of-call
  with the final status (`completed`/`missed`/`declined`); the callee writes only
  when *it* declines — this avoids duplicate logs while covering every attempt.

## Responsive layout (Round 3)

The four destinations (Chats / Calls / Notes / Profile) render differently by
viewport from the **same DOM**, driven by CSS media queries in `styles.css`.

**Breakpoints** (`min-width`):
- `768px`  — tablet / two-pane threshold (`--bp-tablet`)
- `1024px` — desktop (`--bp-desktop`)

**Mobile (`< 768px`)** — single column.
- Primary nav is the **bottom tab bar** (`.tabbar`); the sidebar is `display:none`.
- Chats: list → tap → **full-screen thread** with a header Back button.
- Notes: list → tap → **full-screen editor** with a Back button.
- Safe-area padding (`env(safe-area-inset-*)`) is retained defensively on mobile
  chrome (header / tab bar / message form) but no longer shapes the whole app.

**Tablet (`768–1023px`)** — sidebar **icon-rail** (76px; icons only, labels hidden)
replaces the bottom tab bar; Chats is **two-pane** (list | thread).

**Desktop (`≥ 1024px`)** — full **sidebar** (232px; icon + label + brand + "me")
and **two-pane** Chats (`#chat-list-pane` | `#thread-pane`) and Notes
(`#notes-list-pane` | `#note-editor-pane`), both panes visible simultaneously.
Content panes (Calls / Notes-list / Profile) get a sensible `max-width` so reading
lines stay comfortable; the call overlay is a desktop-sized modal.

### How JS stays minimal & breakpoint-aware
- `ui.js` exposes `isTwoPane()` (a live `matchMedia('(min-width:768px)')`) and
  `onTwoPaneChange(fn)`.
- `chats.openThread()` / `notes.openEditor()` add a `has-thread` / `has-editor`
  class to the view and **only hide the list pane when `!isTwoPane()`** — so on
  desktop/tablet both panes stay visible. Mobile behavior is unchanged.
- The open conversation is highlighted in the list (`.conversation-item--active`),
  which matters in two-pane mode.
- `app.js` listens via `onTwoPaneChange` to re-reveal / re-hide the list pane when
  the viewport crosses the breakpoint while a thread/editor is open (e.g. devtools
  device mode, window resize, rotation).

## iOS removals (Round 3)

The app was de-iOS-ified into a generic responsive website:
- Removed `apple-mobile-web-app-capable`, `apple-mobile-web-app-status-bar-style`,
  and `apple-mobile-web-app-title` meta tags (manifest `name`/`short_name` cover
  the app name; the standard `<meta name="mobile-web-app-capable">` is kept).
- Removed the `maximum-scale=1.0` zoom lock — pinch/zoom is allowed (WCAG).
- Removed `viewport-fit=cover`; the viewport is now
  `width=device-width, initial-scale=1.0`. Safe-area padding remains only as a
  defensive mobile nicety, not a layout driver.
- Replaced the iPhone-shaped centered single-column frame with the responsive
  layout above (sidebar + two-pane on desktop).
- `apple-touch-icon.png` is kept as a harmless extra (and still precached) but the
  app does **not** depend on it — the manifest `icons` (192/512, maskable) are
  canonical.
- Removed iOS Add-to-Home-Screen copy; installability via the standard manifest
  remains and is cross-browser.

## Cross-browser compatibility

- `<video playsinline>` on local + remote elements keeps video inline in all
  browsers (not an iOS-only workaround); local preview is `muted` to allow autoplay.
- `getUserMedia` / `RTCPeerConnection` are invoked from a user gesture (Call /
  Accept button) — good universal practice.
- WebSocket uses `wss` automatically over HTTPS (`${proto}://${location.host}/ws`).

## Accessibility notes (WCAG 2.1 AA)

- **Landmarks:** `header[role=banner]`, the primary nav (`nav[aria-label="Primary"]`
  sidebar on desktop / `nav[aria-label="Primary (mobile)"]` tab bar on mobile — one
  visible per breakpoint), `main#main`. One visible `h1` per view (the header title);
  section `h2`s are screen-reader-only labels.
- **Primary nav:** both the bottom tab bar and the sidebar use `role=tablist` /
  `role=tab` with `aria-selected`, roving `tabindex`, and `aria-controls` tying each
  destination to its view. Keyboard arrow navigation matches orientation: the tab bar
  is **Left/Right** (+ Home/End), the sidebar is **Up/Down** (+ Home/End). Activating
  any nav item routes through the same `showView()`, so both stay in sync.
- **Names on controls:** every icon button has an `aria-label` (send, call, mic,
  camera, end, generate-note, smart-reply, back, new-*).
- **Live regions:** a polite `#live-region` announces new incoming messages and
  call-connected/ended events; an assertive `#alert-region` announces incoming
  and outgoing call ringing. The call status text is `aria-live="assertive"`.
- **State not by color alone:** presence shows a dot **and** the words
  Online/Offline; message status uses the words Sent/Delivered/Read; the active
  tab is underlined as well as colored; the active sidebar destination carries an
  inset left bar + bold weight + background (not color alone); the open
  conversation has a left bar in the list; mute/camera buttons use `aria-pressed`
  and change their label text.
- **Focus:** a high-contrast `:focus-visible` ring (gold on dark) everywhere; a
  skip-link to `#main`; focus is moved to `#main` on view change and returned to
  the trigger when the peer-picker closes.
- **Contrast:** dark theme tokens chosen for ≥ 4.5:1 body text (e.g. `--text`
  ~16:1, `--text-muted` ~8:1 on `--bg`).
- **Touch targets:** `--tap: 44px` minimum on all buttons/inputs; call controls
  are 64px.
- **Forms:** every input has an associated `<label>`; the onboarding error is a
  `role=alert` live region announced programmatically.
- **Reduced motion:** `prefers-reduced-motion` disables transitions/animations.

## PWA / offline

`sw.js` (cache `bevane-shell-v4`) caches the app shell (HTML, CSS, all JS modules,
manifest, icons) on install for offline launch. Bumping the cache name invalidates
the old shell so Round-3 assets ship. `/api/*` and `/ws` are **never** cached
(always network). Navigations fall back to cached `index.html` when offline; static
assets are cache-first with background refresh. No new asset files were added this
round (responsive CSS lives in the existing `styles.css`), so the SHELL list is
unchanged apart from the version bump.
