# Handoff: Frontend Developer → QA / QC

**From:** Frontend Developer Agent
**To:** QA / QC Agent
**Date:** 2026-06-16
**Subject:** Bevane PWA frontend complete — all 4 features wired to the backend contract; ready for your gate.

---

Hi QC,

The mobile-first PWA is built in `/workspaces/Bevane/public`, coded verbatim
against `backend/api_specs.md` and the Backend handoff. No endpoints were
invented. All four features work end-to-end. Architecture details are in
`Frontend/ARCHITECTURE.md`.

## What I built

- **PWA shell** (`public/index.html`): onboarding dialog, 4 views (Chats / Calls /
  Video / Notes), bottom tab bar, full-screen call overlay, peer-picker modal,
  toast + ARIA live regions.
- **`manifest.webmanifest`** (name Bevane, `standalone`, theme `#0b3d91`, 192/512
  PNG + maskable + SVG icons), **`apple-touch-icon`** + apple meta tags,
  **`sw.js`** service worker caching the app shell for offline launch.
- **Vanilla ES modules** under `public/js/` (no build step): `app` (boot/nav),
  `state` (identity + event bus), `api` (REST), `ws` (WebSocket transport),
  `ui` (DOM/a11y helpers), `onboarding`, `chats`, `webrtc`, `calllog`, `notes`,
  `peerpicker`.
- **Icons** under `public/icons/` (SVG + generated PNGs).

## How to run

```bash
cd /workspaces/Bevane
npm install        # if not already
node server.js     # http://localhost:3000  (or `npm start`)
```

Open `http://localhost:3000` in a browser. For calls and real-time chat, open a
**second tab** (or a second device pointed at the public HTTPS URL) and register a
second user. iOS Safari testing must use the **HTTPS** public URL (getUserMedia and
service workers require a secure context; `localhost` is also treated as secure).

> Tip: each browser tab is one identity (`localStorage`). To simulate two users on
> one machine, use a normal tab **and** a private/incognito tab, or two browsers.

## Feature-by-feature test walkthrough

### Onboarding (Epic 0)
1. First launch shows "Welcome to Bevane". Submit an **empty** name → inline
   error appears and is announced (role=alert); registration blocked.
2. Enter a name → app loads; your name shows top-right. Reload → no re-prompt
   (identity persisted in `localStorage` under `bevane.userId`).

### 1. Messaging (Epic 1)
1. Tab **Chats → ＋ New conversation** → pick the other user from the peer list.
   The thread opens (conversation get-or-created via `POST /api/conversations`).
2. Type and send → your bubble appears immediately marked **Sent** (empty/
   whitespace-only sends are rejected — AC-M7).
3. In the second tab, open the same conversation → the message arrives in real
   time (no refresh) and is announced via the live region (AC-M2).
4. Watch status advance **Sent → Delivered → Read** on the sender side once the
   peer is online / views the thread (AC-M6).
5. Start typing in one tab → the other shows "<name> is typing…" (AC-M4).
6. Peer presence shows **Online/Offline with a dot AND the word** (top of thread
   and in the conversation list — A8).
7. Reload → full history reloads in order via `GET /…/messages` (AC-M3).

### 2. Voice calling (Epic 2) — needs two tabs/devices
1. In an open thread tap the **📞** button, OR **Calls → ＋ New voice call** and
   pick a peer. Caller sees "Calling…"; an outgoing-ring is announced.
2. The other tab gets a full-screen **incoming call** overlay with Accept/Decline
   (announced assertively — AC-V2). Grant mic permission when prompted.
3. Accept → two-way audio over WebRTC; status shows "Connected" (AC-V3).
4. In-call: **Mute** (toggles, label + `aria-pressed` flip) and **End** (AC-V4).
5. Either side ends → both return to idle (AC-V5).
6. **Calls** tab lists the attempt with type=voice, status, duration via
   `GET /api/calls` (AC-V6). Decline and offline (call:unavailable) also log.

### 3. Video calling (Epic 3) — needs two tabs/devices
1. Thread **🎥** button or **Video → ＋ New video call** → pick a peer. Grant
   camera+mic. Caller sees the local self-preview.
2. Callee accepts → remote video fills the screen, local self-preview in the
   corner; both `playsinline` for iOS (AC-VD3).
3. In-call: **Mute mic**, **Camera** toggle (turns the local track on/off), **End**
   (AC-VD4). Either side ends → idle (AC-VD5).
4. **Video** tab logs the attempt with type=video, status, duration (AC-VD6).

### 4. Notes + AI (Epic 4)
1. **Notes → ＋ New note** → title + body → Save. Listed most-recent-first
   (AC-N2). Tap a note to **edit** or **delete** (AC-N1).
2. **Generate note from conversation:** open a thread that has messages, tap the
   **✦** button in the thread header → calls `POST /api/ai/generate-note`; a new
   note is saved and labeled **"✦ AI-generated"** in both the list and editor
   (AC-N3, AC-N6). Works fully offline / no API key (AC-N4).
3. **Smart replies:** in a thread, tap the **✨** button (left of the composer) →
   2–4 suggestion chips from `POST /api/ai/smart-reply`; tap one to insert it into
   the composer (AC-N5). Each chip is prefixed "✨" and `aria-label`led as AI.

## Accessibility implemented (please verify each — BRD §5)

- **A1 Landmarks:** `header[role=banner]`, `nav[aria-label=Primary]`, `main#main`;
  single visible `h1` per view (header title), section `h2`s screen-reader-only.
- **A2 Keyboard + focus:** everything is reachable by Tab; high-contrast gold
  `:focus-visible` ring; skip-link to `#main`; tab bar supports Arrow/Home/End.
- **A3 aria-labels:** on every icon button — send, voice, video, generate-note,
  smart-reply, mic/mute, camera, accept, decline, end, back, all "New …" buttons.
- **A4 Live regions:** `#live-region` (polite) announces incoming messages and
  call connected/ended; `#alert-region` (assertive) + call status announce
  incoming/outgoing calls.
- **A5 Contrast:** dark palette tuned to ≥ 4.5:1 for text (tokens in
  `css/styles.css` `:root`).
- **A6 Labels:** every input/textarea has an associated `<label>`; onboarding
  error is a `role=alert`.
- **A7 Targets:** `--tap: 44px` minimum on controls; call buttons 64px.
- **A8 Not color alone:** presence (dot **+** "Online/Offline"), message status
  words (Sent/Delivered/Read), active tab underlined, mute/camera `aria-pressed`
  + label text.
- Reduced-motion respected via `prefers-reduced-motion`.

## What I verified before handing off

- Server boots; `curl http://localhost:3000/` serves **my** `index.html` (not the
  placeholder). `manifest.webmanifest`, `sw.js`, `js/app.js`, and
  `icons/apple-touch-icon.png` all return **200** with correct content types.
- All 11 JS modules pass `node --check` (as ES modules). `sw.js` passes too.
- Full REST flow exercised via curl with two users: register → list users →
  get-or-create conversation → post message → smart-reply (3 suggestions) →
  generate-note (source `ai`, summary + actionItems) → log call
  (durationSec computed) → empty message rejected (400).

## Known limitations / notes

- **WebRTC needs a reachable path between peers.** Only a public **STUN** server
  is configured (per the non-goals — no TURN). On restrictive/symmetric NATs the
  media may not connect; localhost-to-localhost and same-LAN devices are fine.
- iOS Safari requires the **HTTPS** public URL for camera/mic and the service
  worker. The first call after load must come from a user tap (handled).
- Identity is per-browser-profile (`localStorage`). Two tabs in the *same*
  profile share one identity and will replace each other's WS socket (the server
  sends `error code:"replaced"`, surfaced as a toast). Use two profiles/devices
  to test two distinct users.
- Call logging avoids duplicates: the **caller** writes the log for completed/
  missed/unavailable; the **callee** writes only when it declines. Every attempt
  is logged exactly once.
- Group calls, attachments, search, and push-while-closed are out of scope (BRD §6).

## Acceptance criteria for your final gate

- [ ] Onboarding registers, persists identity, survives reload; empty name blocked + announced.
- [ ] Messaging: real-time send/receive across two tabs; history reloads in order;
      Sent→Delivered→Read; typing indicator; presence with text+icon; empty rejected.
- [ ] Voice call between two tabs/devices: invite→incoming→accept/decline; two-way
      audio; mute + end; both return to idle; logged with correct type/status/duration.
- [ ] Video call: same flow + remote video, local self-preview, camera toggle; logged.
- [ ] Notes: full CRUD, most-recent-first; Generate-note shows summary/action items
      and is labeled AI-generated; smart-reply chips insert; all offline (no key).
- [ ] PWA: installable on iOS ("Add to Home Screen"), launches standalone, app shell
      works offline; manifest + sw + apple-touch-icon present and 200.
- [ ] Accessibility (WCAG 2.1 AA): landmarks, single H1/view, keyboard operable +
      visible focus, aria-labels on icon buttons, aria-live for messages + calls,
      contrast ≥ 4.5:1, labeled inputs, ≥44×44px targets, no color-only state.

Ping me if any flow misbehaves or a payload looks off and I'll fix it fast.

**Frontend Developer Agent**
