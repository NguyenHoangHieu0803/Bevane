# Bevane — Project Guideline

A practical guide to running, using, testing, and extending **Bevane**, the private peer-to-peer communication app built by the AI Agent Team.

> **What Bevane is:** a mobile-first **Progressive Web App (PWA)** delivering four features — Messaging, Voice Calling, Video Calling, and Notes (with offline AI assistance). It runs in iOS Safari, is installable to the Home Screen, and is reached by scanning a QR code that opens a public HTTPS URL.
>
> **Why a PWA and not a native iOS app:** the documented plan targeted native Swift/SwiftUI, but a native binary cannot be built or distributed from this Linux Codespace (it requires Xcode + an Apple Developer account + App Store/TestFlight). The PWA is what makes "scan → open → use on an iPhone" actually possible from this environment.

---

## 1. Quick Start

### Prerequisites
- Node.js 18+ (developed on Node 24) and npm
- A GitHub Codespace (for public URL forwarding) or any host where you can expose a port over HTTPS

### Step 1 — Install dependencies (first time only)
```bash
cd /workspaces/Bevane
npm install
```

### Step 2 — Start the server
```bash
node server.js
```
The server boots on **port 3000**, serving the API, WebSocket, and the PWA from the same origin. You should see:
```
[bevane] HTTP + WS listening on http://0.0.0.0:3000
[bevane] WebSocket endpoint: ws://<host>:3000/ws
[bevane] SQLite DB: /workspaces/Bevane/data/bevane.db
[bevane] Serving static frontend from: /workspaces/Bevane/public
```

### Step 3 — Open a public HTTPS tunnel (required for mobile / WebRTC)

**Option A — localtunnel (fixed URL `https://bevane.loca.lt`)**

Open a **second terminal** and run:
```bash
node -e "
const localtunnel = require('localtunnel');
(async () => {
  const tunnel = await localtunnel({ port: 3000, subdomain: 'bevane' });
  console.log('Tunnel URL:', tunnel.url);
  tunnel.on('error', (err) => console.error('Tunnel error:', err));
  tunnel.on('close', () => console.log('Tunnel closed'));
})().catch(console.error);
"
```
When you see `Tunnel URL: https://bevane.loca.lt` the tunnel is live.

> **loca.lt bypass page:** On the first visit, loca.lt shows a page asking you to confirm your IP. Click **"Click to Submit"** on that page, then navigate back to `https://bevane.loca.lt`.

**Option B — GitHub Codespaces port forwarding**
```bash
# expose the port publicly
gh codespace ports visibility 3000:public -c "$CODESPACE_NAME"

# the public URL follows this pattern:
echo "https://${CODESPACE_NAME}-3000.${GITHUB_CODESPACES_PORT_FORWARDING_DOMAIN}"
```

> ⚠️ iOS Safari requires **HTTPS** for camera/microphone (WebRTC). Both options above provide HTTPS; plain `http://localhost` will not grant media access on a phone.

### Why "503 - Tunnel Unavailable"?

This error from `bevane.loca.lt` means one of two things:
1. **The server is not running** — start it with `node server.js` (Step 2 above).
2. **The tunnel is not running** — start it with the localtunnel command in Step 3.

Both the server **and** the tunnel must be running simultaneously. If you restart your Codespace or terminal, you need to restart both.

---

## 2. Using the App on iOS

1. **Scan** the QR code ([bevane-qr.png](bevane-qr.png)) with the iPhone Camera, or open the public URL in **Safari**.
2. **Onboard:** enter a display name. This registers you (`POST /api/users`) and stores your user id in `localStorage`.
3. **Install (optional):** Share → **Add to Home Screen** to launch it full-screen like a native app (PWA via [manifest.webmanifest](public/manifest.webmanifest) + [sw.js](public/sw.js)).
4. **Navigate** with the bottom tab bar: **Chats / Calls / Video / Notes**.

### Testing peer features
Messaging, voice, and video are **peer-to-peer** — you need **two participants** on the same server. Open the app on:
- two phones, **or**
- two browser tabs / two browser profiles (each onboards as a separate user).

Then pick the other user from the peer picker to start a chat or call.

---

## 3. The Four Features

| Feature | What it does | Key files |
|---------|--------------|-----------|
| **Messaging** | Real-time chat over WebSocket: optimistic send, typing indicator, delivered/read receipts, presence, history via REST | [public/js/chats.js](public/js/chats.js), [src/ws.js](src/ws.js) |
| **Voice Calling** | WebRTC audio call with Google STUN; invite/accept/decline/end signaling; mute + end controls; logged via REST | [public/js/webrtc.js](public/js/webrtc.js), [public/js/calllog.js](public/js/calllog.js) |
| **Video Calling** | WebRTC video: local self-preview + remote stream (`playsinline`), mute, camera toggle, end | [public/js/webrtc.js](public/js/webrtc.js) |
| **Notes** | Full CRUD plus **offline AI**: "Generate note from conversation" and smart-reply suggestions in chat | [public/js/notes.js](public/js/notes.js), [src/ai.js](src/ai.js) |

The AI helper in [src/ai.js](src/ai.js) is **fully local and deterministic** — no external API key, works offline, and produces reproducible output for testing.

---

## 4. Architecture Overview

```
iPhone (Safari / PWA)
        │  HTTPS  +  WSS
        ▼
┌─────────────────────────────────────────────┐
│  Node.js  (server.js, port 3000)             │
│  ├─ Express  → REST API  (/api/*)            │
│  ├─ ws       → WebSocket (/ws)               │
│  │            • chat relay + receipts        │
│  │            • presence + typing            │
│  │            • WebRTC signaling relay       │
│  ├─ static   → PWA from /public              │
│  ├─ src/db.js  → SQLite (data/bevane.db)     │
│  └─ src/ai.js  → offline note/smart-reply    │
└─────────────────────────────────────────────┘
```

- **Same-origin design:** the frontend calls `fetch('/api/...')` and connects to `ws(s)://<host>/ws` — no CORS, no separate host.
- **Database:** a single SQLite file at `data/bevane.db`, auto-created on boot with 5 tables: `users`, `conversations`, `messages`, `notes`, `call_logs`.
- **Frontend:** vanilla ES modules, **no build step** — files in [public/](public/) are served as-is.
- **Signaling vs media:** the server only *relays* WebRTC offer/answer/ICE; the actual audio/video stream flows peer-to-peer (STUN-assisted, no TURN).

Deeper detail:
- API + WebSocket contract → [backend/api_specs.md](backend/api_specs.md)
- Frontend structure & data flow → [Frontend/ARCHITECTURE.md](Frontend/ARCHITECTURE.md)
- Backend run notes → [backend/README.md](backend/README.md)

---

## 5. Testing & Quality

```bash
# 1. start the server
node server.js &

# 2. WebSocket smoke test (two clients: chat, receipts, typing, signaling)
node tests/ws_smoke.js

# 3. syntax-check frontend modules
for f in public/js/*.js public/sw.js; do node --check "$f"; done
```

Reference material:
- Test plan & cases → [tests/test_plans.md](tests/test_plans.md)
- WebSocket test script → [tests/ws_smoke.js](tests/ws_smoke.js)
- Known issues → [docs/bug_tracker.md](docs/bug_tracker.md)
- Pre-release gate → [RELEASE_CHECKLIST.md](RELEASE_CHECKLIST.md)

**Current quality status (QC gate):** GO — 42/42 REST, 21/21 WebSocket, 9/9 WCAG 2.1 AA checks passed. One open **Low/cosmetic** item: BUG-001 (AI note title shows owner's name instead of the peer's).

### Accessibility
Bevane targets **WCAG 2.1 AA**: semantic landmarks, `aria-label` on every icon control, `aria-live` regions for incoming messages/call status, a `tablist` bottom bar with arrow-key navigation, labeled inputs, visible focus rings, ≥4.5:1 contrast, ≥44px touch targets, and reduced-motion support.

---

## 6. Generating the QR Code

```bash
URL="https://${CODESPACE_NAME}-3000.${GITHUB_CODESPACES_PORT_FORWARDING_DOMAIN}"

# PNG (printable / shareable)
node -e "require('qrcode').toFile('bevane-qr.png', process.argv[1], {width:600, margin:2}, e=>{if(e)throw e})" "$URL"

# render in the terminal
node -e "require('qrcode-terminal').generate(process.argv[1], {small:true}, q=>console.log(q))" "$URL"
```
Outputs: [bevane-qr.png](bevane-qr.png) and [public/assets/bevane-qr.svg](public/assets/bevane-qr.svg).

> The URL embeds the Codespace name, so the QR is only valid while that Codespace is running. Regenerate it after restarting or in a new Codespace.

---

## 7. How This Was Built — The AI Agent Team

Bevane was produced by four agents working **in sequence**, each handing off to the next. Every prompt/communication is recorded in [communication-history/](communication-history/).

| Order | Agent | Output | Handoff |
|-------|-------|--------|---------|
| 1 | **Business Analyst** | Requirements, user stories, data model + API contract | [01_BA_to_Backend.md](communication-history/01_BA_to_Backend.md) |
| 2 | **Backend Developer** | Express + WebSocket + SQLite APIs, signaling relay, offline AI | [02_Backend_to_Frontend.md](communication-history/02_Backend_to_Frontend.md) |
| 3 | **Frontend Developer** | Accessible mobile-first PWA, WebRTC, service worker | [03_Frontend_to_QC.md](communication-history/03_Frontend_to_QC.md) |
| 4 | **QA/QC Full-Stack** | Hands-on testing, final quality gate | [04_QC_Final_Report.md](communication-history/04_QC_Final_Report.md) |

The roles and full plan live in [agents/AGENT_TEAMS_PLAN.MD](agents/AGENT_TEAMS_PLAN.MD).

---

## 8. Project Layout

```
Bevane/
├── server.js                 # Express + WebSocket + static host
├── package.json
├── src/
│   ├── db.js                 # SQLite setup + query helpers
│   ├── ws.js                 # WebSocket: chat, presence, signaling relay
│   └── ai.js                 # offline note-gen + smart-reply
├── public/                   # the PWA (served same-origin, no build)
│   ├── index.html
│   ├── manifest.webmanifest
│   ├── sw.js                 # service worker (offline app shell)
│   ├── css/styles.css
│   ├── js/                   # vanilla ES modules
│   └── icons/                # PWA + apple-touch icons
├── data/bevane.db            # SQLite (auto-created on boot)
├── docs/                     # business reqs, user stories, bug tracker
├── backend/                  # api_specs.md, backend README
├── Frontend/ARCHITECTURE.md
├── tests/                    # test plan + ws smoke test
├── communication-history/    # recorded agent-to-agent handoffs
├── RELEASE_CHECKLIST.md
└── bevane-qr.png             # scannable launch QR
```

---

## 9. Known Limitations

- **PWA, not native** — no App Store binary; distribution is via the public URL + QR.
- **STUN only, no TURN** — calls may fail across restrictive/symmetric NATs.
- **No end-to-end encryption** and **no authentication/passwords** — identity is a display name + generated id stored in `localStorage` (demo scope).
- **1:1 only** — no group chats or multi-party calls.
- **Ephemeral URL** — tied to the running Codespace; the data lives in a local SQLite file.

For the full scope and non-goals, see [docs/business_requirements.md](docs/business_requirements.md).
