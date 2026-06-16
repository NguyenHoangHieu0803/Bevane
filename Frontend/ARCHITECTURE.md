# Bevane Frontend — Architecture

Mobile-first vanilla-JS Progressive Web App. **No build step** — every file under
`/public` is served statically, same-origin, by the existing Node server. JS is
authored as native ES modules (`<script type="module">`); the browser loads them
directly.

## File structure

```
public/
├── index.html               # App shell: onboarding, 4 views, tab bar, call overlay, dialogs
├── manifest.webmanifest      # PWA manifest (name Bevane, standalone, theme, icons)
├── sw.js                     # Service worker — caches app shell for offline launch
├── css/
│   └── styles.css            # All styles (CSS custom properties; AA contrast tokens)
├── icons/
│   ├── icon.svg              # Scalable logo (referenced by manifest + favicon)
│   ├── icon-192.png          # PWA icon
│   ├── icon-512.png          # PWA icon (also used as maskable)
│   └── apple-touch-icon.png  # 180×180 iOS home-screen icon
└── js/
    ├── app.js                # Entry point: boot, onboarding gate, navigation, SW registration
    ├── state.js              # Shared state + localStorage identity + tiny pub/sub event bus
    ├── api.js                # REST client (fetch wrapper, ApiError)
    ├── ws.js                 # WebSocket transport: wss-derivation, auth, reconnect, frame fan-out
    ├── ui.js                 # DOM helpers, live-region announce, toast, formatters, uuid
    ├── onboarding.js         # First-launch registration (POST /api/users)
    ├── chats.js              # Messaging: list, thread, send/receive, typing, read, smart-reply
    ├── webrtc.js             # Voice + video calling (RTCPeerConnection, signaling, controls, logging)
    ├── calllog.js            # Voice/video call-log views (GET /api/calls)
    ├── notes.js              # Notes CRUD + AI-generated labeling
    └── peerpicker.js         # Modal to choose a peer for chat/voice/video
```

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
- **Navigation:** `app.js` owns the bottom tab bar and view switching. Each view
  is a `<section>`; only one is visible. Sub-panes (chat thread, note editor)
  toggle a Back button in the header.

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
  grants media (satisfies the iOS user-gesture requirement). On Accept:
  `getUserMedia` → PC → `setRemoteDescription(offer)` → `createAnswer` →
  send `call:accept` + `webrtc:answer`.
- ICE candidates relayed via `webrtc:ice` both ways.
- In-call controls toggle `track.enabled` (mute mic, camera on/off). Hang up
  sends `call:end` (or `call:cancel` if still ringing), stops tracks, closes PC.
- **Call logging:** the caller always writes `POST /api/calls` at end-of-call
  with the final status (`completed`/`missed`/`declined`); the callee writes only
  when *it* declines — this avoids duplicate logs while covering every attempt.

## iOS Safari compatibility

- `<video playsinline>` on both local and remote elements (prevents fullscreen
  takeover); local preview is `muted` to allow autoplay.
- `getUserMedia` and `RTCPeerConnection` are only invoked from a user gesture
  (Call button / Accept button).
- `viewport-fit=cover` + `env(safe-area-inset-*)` padding for the notch.
- `apple-mobile-web-app-capable`, `apple-mobile-web-app-status-bar-style`,
  `apple-mobile-web-app-title`, and an `apple-touch-icon` enable Add-to-Home-Screen.
- WebSocket uses `wss` automatically over HTTPS.

## Accessibility notes (WCAG 2.1 AA)

- **Landmarks:** `header[role=banner]`, `nav[aria-label="Primary"]`,
  `main#main`. One visible `h1` per view (the header title); section `h2`s are
  screen-reader-only labels.
- **Tab bar:** `role=tablist` / `role=tab` with `aria-selected`, roving
  `tabindex`, and Arrow/Home/End keyboard navigation; `aria-controls` ties each
  tab to its view.
- **Names on controls:** every icon button has an `aria-label` (send, call, mic,
  camera, end, generate-note, smart-reply, back, new-*).
- **Live regions:** a polite `#live-region` announces new incoming messages and
  call-connected/ended events; an assertive `#alert-region` announces incoming
  and outgoing call ringing. The call status text is `aria-live="assertive"`.
- **State not by color alone:** presence shows a dot **and** the words
  Online/Offline; message status uses the words Sent/Delivered/Read; the active
  tab is underlined as well as colored; mute/camera buttons use `aria-pressed`
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

`sw.js` caches the app shell (HTML, CSS, all JS modules, manifest, icons) on
install for offline launch. `/api/*` and `/ws` are **never** cached (always
network). Navigations fall back to cached `index.html` when offline; static
assets are cache-first with background refresh.
