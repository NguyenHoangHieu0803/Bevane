# Bevane — Business Requirements Document

**Author:** Business Analyst Agent
**Date:** 2026-06-16
**Version:** 3.0 (Web App conversion — responsive desktop + mobile)
**Status:** Baseline for Backend handoff v3
**Supersedes:** v2.0 (Full-spec, mobile/iOS-PWA framing)

---

## 0. How to read this document

This is a **full product spec**. To keep the build honest, **every feature is tagged**:

- **[WORKING]** — implemented end-to-end and functional today.
- **[STUB]** — must be **represented in the UI** as a clearly-labeled control that gives **"Coming soon"** feedback. Never a silent dead button. No real backend behavior required yet.
- **[ROADMAP]** — planned for a future phase; not required in the UI this round (may appear in settings/roadmap text only). See `ROADMAP.md`.

**Scope strategy (binding):** EVERY feature listed in this document must be **represented** in the UI. Features that already work stay functional; everything else ships as a clearly-labeled stub.

**What changed in v3 (read this first):** Bevane is **already a web application** — Node/Express + `ws` (WebSocket) + SQLite backend, vanilla-JS browser frontend in `/public`. There is **no native iOS/Swift code** and never was. v3 is **not a rewrite**. v3 reframes the product from "mobile/iOS-PWA" to a **general, responsive Web Application** that works well on **desktop and mobile browsers**. The work this round is **UI/layout + cleanup**, not new features:

1. A **full responsive redesign** (desktop-first, sidebar + two-pane chat, collapsing to single-column on mobile).
2. **Stripping iOS-specific bits** (Apple-only PWA meta tags, iPhone-only framing).
3. A normal **HTTPS web origin** delivery at **https://bevane.loca.lt** (a localtunnel pointing at the running server; WebSocket over `wss`).
4. An explicit, testable **conversation/data persistence** requirement (everything in SQLite, surviving restart/reload/reconnect).

See the dedicated **§2 (Web App conversion)** below and the focused spec in `web_app_conversion.md`.

---

## 1. Vision

Bevane is a private communication app: **chat, voice call, video call, and AI-assisted notes** between people, with a lightweight onboarding flow and a personal profile/QR identity. It runs in **any modern browser on desktop or mobile** — no App Store, no native install, no API keys.

### Vision statement
> "Open a link, set up a profile, and instantly chat, call, video, and take smart notes — privately and accessibly — in any browser, on any screen size, with no App Store and no API keys."

---

## 2. Web App conversion (v3 — binding)

This section is the heart of v3. The focused implementation spec lives in `web_app_conversion.md`; this is the requirements summary.

### 2.1 Delivery decision — responsive Web Application
**Decision (approved by the Agent Teams Lead):** Bevane is delivered as a **standard responsive web application**, served over HTTPS, that works on **desktop and mobile browsers**. It may remain installable (Web App Manifest + service worker) but is **no longer iOS-targeted** and is **not** framed as an iPhone-shaped column.

- Origin: a normal HTTPS web origin. The reference deployment is **https://bevane.loca.lt** (a localtunnel with the `bevane` subdomain pointing at the running Node server).
- Same-origin delivery: the Node server serves the entire app (HTML/CSS/JS) and the `/api/*` + `/ws` endpoints from one origin.
- Real-time: a single WebSocket channel must work over **`wss`** through the tunnel/proxy.

### 2.2 Responsive layout requirements (binding)
- **Desktop (≥ 1024px):** a **persistent left sidebar navigation** (Chats / Calls / Notes / Profile) beside a content area. Proper desktop chrome — **not** an iPhone-shaped centered column.
  - **Chats view = two-pane:** the **conversation list** and the **open thread** are shown **side-by-side** (list pane | thread pane). Selecting a conversation opens it in the thread pane without leaving the list.
- **Tablet (768px–1023px):** sidebar may collapse to icons or a rail; chat may be one or two panes depending on width.
- **Mobile (< 768px):** **single-column** layout. Navigation collapses to a **bottom tab bar** (or hamburger). Chats become list → thread (full-screen thread with Back), as today.
- The layout must **reflow gracefully** across these breakpoints with no horizontal scrolling and no clipped controls.
- Breakpoints are guidance; the exact values live in `web_app_conversion.md` and `Frontend/ARCHITECTURE.md`.

### 2.3 iOS-specifics to REMOVE or generalize (binding)
The following Apple/iPhone-only assumptions must be **removed or generalized** so the app reads as a normal cross-browser website. (Full checklist in `web_app_conversion.md`.)
- Apple-only PWA meta tags: `apple-mobile-web-app-capable`, `apple-mobile-web-app-status-bar-style`, `apple-mobile-web-app-title`.
- Reliance on **`apple-touch-icon`** as the only/primary install icon (keep standard manifest `icons`; an apple-touch-icon may remain as a harmless extra, but must not be load-bearing).
- iPhone-only **safe-area / notch** framing (`viewport-fit=cover` + `env(safe-area-inset-*)` used to shape the whole app like a phone). Safe-area padding may remain as a defensive nicety, but it must not drive the desktop layout.
- `maximum-scale=1.0` viewport lock (it blocks pinch-zoom and harms accessibility on the web — remove it).
- **iOS-only WebRTC assumptions** in copy/comments: `playsinline` stays (it's harmless and correct cross-browser), but documentation/UX must not assume iOS Safari is the only target.
- Any **"Add to Home Screen on iOS"** onboarding copy → generalize to "install / add to your device" or drop.

### 2.4 Conversation & data persistence (binding, explicit, testable)
**All conversations and user data must be persisted in SQLite and survive server restart, browser reload, and WebSocket reconnect.** Specifically:
- **Messages** — every chat message is written to SQLite and re-listed on reload (`GET /api/conversations/:id/messages`).
- **Conversations** — the conversation list persists and re-lists on reload (`GET /api/conversations?userId=`).
- **Notes** — persisted and re-listed (`GET /api/notes?ownerId=`).
- **Call logs** — persisted and re-listed (`GET /api/calls?userId=`).
- **Users/identity** — persisted server-side; the client's `id` is in `localStorage`.

**Acceptance (testable):** After sending messages, creating a note, and completing a call, then **restarting the Node server** and **reloading the browser**, all of the above reappear with the same content and ordering. Querying the SQLite file directly shows the rows. This is verified and documented by Backend in `09_BA_to_Backend_v3.md` / `10_Backend_to_Frontend_v3.md`.

### 2.5 What stays the same
The **entire feature catalog (§5) and the [WORKING]/[STUB]/[ROADMAP] tags are unchanged.** v3 adds no new features. The backend API contract (`backend/api_specs.md`) is unchanged. WebRTC, AI endpoints, and the WS protocol are unchanged.

---

## 3. Agreed Technical Stack (binding for the whole team)

| Layer | Technology |
|-------|-----------|
| Backend | Node.js + Express + `ws` (WebSocket) + `better-sqlite3` (local SQLite) |
| Transport | REST APIs (HTTP) + a single WebSocket channel for real-time chat **and** WebRTC signaling |
| Frontend | Vanilla-JS, **responsive** (desktop + mobile), no heavy framework, served same-origin by the Node server |
| Layout | Desktop-first: sidebar nav + content; **two-pane chat** on wide screens; single-column + bottom tabs on mobile |
| Install (optional) | Web App Manifest + service worker (installable, **not** iOS-targeted) |
| Real-time media | WebRTC (browser-native) for voice and video |
| AI | Local, **deterministic, offline** helper (`src/ai.js`) — no external API key, no network |
| Delivery | HTTPS web origin (reference: **https://bevane.loca.lt** via localtunnel; `wss` for WebSocket) |

---

## 4. Navigation & app structure

Onboarding, then a primary navigation with four destinations. The **same four destinations** render as a **sidebar on desktop** and a **bottom tab bar on mobile**. Full flow in `screen_flow.md`.

```
Splash → Welcome → Sign Up / Log In → OTP verify → Set Profile → Home
Home destinations:  [ Chats ]  [ Calls ]  [ Notes ]  [ Profile ]
  desktop → left sidebar nav        mobile → bottom tab bar
```

- **Auth/Onboarding:** Splash, Welcome, Sign Up, Log In, OTP, Set Profile. (Identity remains lightweight; OTP/password are **[STUB]** — see `auth_and_profile.md`.)
- **Chats:** conversation list → 1:1 chat → group chat. **On desktop, list and open thread are side-by-side (two-pane).**
- **Calls:** call history → outgoing/active/incoming call → video active/PiP.
- **Notes:** notes list → editor → checklist/reminder/lock sub-screens.
- **Profile:** avatar, display name, personal QR, scan QR, change password, notification settings, logout.

---

## 5. Feature catalog (all four areas + auth/profile)

Per-feature one-line specs live in `feature_specs/*.md`. This section is the master catalog with tags. **Unchanged from v2 — v3 is layout/cleanup, not new features.**

### 5.1 Messaging — see `feature_specs/messaging.md`

**Core**
- 1:1 real-time text chat — **[WORKING]**
- Conversation history persistence — **[WORKING]**
- Typing indicator — **[WORKING]**
- Presence (online/offline) — **[WORKING]**
- Message status: sent / delivered / seen — **[WORKING]**
- Group chat (3+ participants) — **[STUB]** (minimal backend group concept; UI stubbed)
- Reactions (❤️ 😂 👍 😮 😢 🙏) — **[STUB]** (schema fields present; UI stubbed)
- Reply (quote a message) — **[STUB]**
- Forward message — **[STUB]**
- Delete / unsend message — **[STUB]** (`deleted` field present)
- Pin message — **[STUB]**
- Search in conversation — **[STUB]**
- Media: image / video / voice / file / location / contact — **[STUB]**

**AI (offline, deterministic)**
- Smart reply suggestions — **[WORKING]**
- Tone adjuster (rewrite draft in a chosen tone) — **[WORKING]** (`/api/ai/tone-adjust`)
- Auto-translate message — **[WORKING]** (`/api/ai/translate`, demo translation)
- Chat summary — **[WORKING]** (`/api/ai/chat-summary`)
- Spam / scam detection — **[STUB]**

### 5.2 Calling (audio) — see `feature_specs/calling.md`

**Core**
- 1:1 WebRTC voice call (invite/accept/decline/end) — **[WORKING]**
- Mute / unmute mic — **[WORKING]**
- Call duration timer — **[WORKING]**
- Call history (missed / received / dialed) — **[WORKING]**
- Call logging (type/status/duration) — **[WORKING]**
- Ringtone on incoming call — **[STUB]**
- Speaker toggle — **[STUB]**
- Hold — **[STUB]**
- Switch-to-video mid-call — **[STUB]**
- Add participant (group voice) — **[STUB]**
- Group voice call (3+) — **[STUB]**
- Missed-call notification — **[STUB]** (in-app indicator works; system push is [ROADMAP])
- Do Not Disturb (DND) — **[STUB]**

**AI**
- Noise cancellation — **[STUB]** (true ML denoise is [ROADMAP])
- Live transcription — **[STUB]**
- Post-call summary — **[STUB]**
- Emotion detection — **[STUB]**

### 5.3 Video Calling — see `feature_specs/video_calling.md`

**Core**
- 1:1 WebRTC video call (invite/accept/decline/end) — **[WORKING]**
- Mute mic / camera on-off / hang up — **[WORKING]**
- Local self-preview + remote view — **[WORKING]**
- Switch front / rear camera — **[STUB]** (feasible via `getUserMedia` facingMode)
- Group grid layout (3+) — **[STUB]**
- Screen share — **[STUB]** (desktop browsers support `getDisplayMedia`; now a normal desktop target — see note)
- Virtual background — **[STUB]** (ML — [ROADMAP])
- Beauty filter — **[STUB]**
- Picture-in-Picture (PiP) — **[STUB]**
- Connection-quality indicator — **[STUB]**
- Call recording — **[STUB]** (server-side/group recording is [ROADMAP])

> v3 note: since the app now explicitly targets **desktop browsers**, `getDisplayMedia` screen-share is feasible on desktop. It remains **[STUB]** this round (no new features) but is no longer "infeasible".

**AI**
- Virtual background (segmentation) — **[STUB]** / **[ROADMAP]** (ML)
- Auto-framing — **[STUB]** / **[ROADMAP]**
- Live captions — **[STUB]**
- Low-light enhancement — **[STUB]**
- Gesture recognition — **[STUB]** / **[ROADMAP]**

### 5.4 Notes — see `feature_specs/notes.md`

**Core**
- Create / read / update / delete note — **[WORKING]**
- Notes list (most-recent-first) — **[WORKING]**
- Rich text formatting — **[STUB]**
- Folders / categories — **[STUB]** (`folder` column present)
- Pin note — **[STUB]** (`pinned` column present)
- Search notes — **[STUB]**
- Color labels — **[STUB]** (`color` column present)
- Checklist items — **[STUB]** (`checklist` column present)
- Image attachment — **[STUB]**
- Voice-to-note — **[STUB]**
- Reminder — **[STUB]** (`reminderAt` column present; system alarm is [ROADMAP])
- Share / export PDF — **[STUB]**
- History / versions — **[STUB]**
- Lock (PIN) — **[STUB]** (`locked` column present; Face ID unavailable on web — [ROADMAP])

**AI (offline, deterministic)**
- Generate note from conversation (summary + action items) — **[WORKING]**
- Write assistant — **[STUB]**
- Auto-summarize a note — **[WORKING]** (`/api/ai/note-summarize`)
- Smart tags — **[WORKING]** (`/api/ai/smart-tags`)
- Grammar check — **[STUB]**
- Action-item extractor — **[WORKING]** (`/api/ai/action-items`)
- Ask AI about this note — **[WORKING]** (`/api/ai/ask-about-note`)

### 5.5 Auth & Onboarding & Profile — see `feature_specs/auth_and_profile.md`

**Onboarding/Auth**
- Splash screen — **[STUB]** (visual)
- Welcome screen — **[STUB]**
- Sign Up (display name → identity) — **[WORKING]**
- Log In (return to existing identity) — **[STUB]**
- OTP verification — **[STUB]**
- Set Profile (display name + avatar) — **[STUB]** (display name works; avatar stubbed)

**Profile destination**
- Avatar — **[STUB]**
- Display name (view/edit) — **[WORKING]** (view; edit may be [STUB])
- Personal QR (others scan to add as contact) — **[STUB]**
- Scan QR (add a contact) — **[STUB]**
- Change password — **[STUB]**
- Notification settings — **[STUB]**
- Logout — **[STUB]** (clearing local identity is feasible; surfaced as a labeled control)

---

## 6. Acceptance criteria (cross-feature rules)

Detailed per-feature acceptance criteria live in `user_stories.md`. Global rules:

- **AC-GLOBAL-WORKING:** A [WORKING] feature behaves per its acceptance criteria in `user_stories.md`, end-to-end, between two browser tabs and two devices.
- **AC-GLOBAL-STUB:** Every [STUB] feature **has a visible, labeled control** in the correct screen. Activating it shows clear **"Coming soon"** feedback and never appears broken, never silently does nothing, and never blocks navigation.
- **AC-GLOBAL-RESPONSIVE (v3):** Every view renders correctly at **desktop (≥1024px)**, **tablet (768–1023px)**, and **mobile (<768px)** with no horizontal scroll, no clipped controls, and the correct navigation chrome (sidebar on desktop, bottom tabs on mobile). The Chats view is **two-pane** on desktop and **list→thread** on mobile.
- **AC-GLOBAL-PERSIST (v3):** After a server restart and a browser reload, all conversations, messages, notes, and call logs reappear (see §2.4).

---

## 7. Accessibility requirements (WCAG 2.1 AA — applies to WORKING and STUB)

- A1: Semantic HTML landmarks (header/nav/main/footer); single H1 per view.
- A2: All interactive controls keyboard-operable with a visible focus indicator. **(v3) On desktop, full keyboard navigation of the sidebar and two-pane chat is required — Tab/Shift-Tab order is logical; arrow-key nav within the conversation list is recommended.**
- A3: All non-text controls (call, mic/camera, send, reactions, nav icons) have descriptive `aria-label`s.
- A4: Live regions (`aria-live`) announce new incoming messages, incoming calls, and "Coming soon" stub feedback.
- A5: Color contrast ≥ 4.5:1 normal text, ≥ 3:1 large text / UI components.
- A6: Form inputs (sign up, OTP, profile, note editor) have associated `<label>`s; errors announced programmatically.
- A7: Touch/click targets ≥ 44×44 px on mobile; pointer targets on desktop are at least the platform default (larger optional). **(v3) Do NOT lock zoom — remove `maximum-scale=1.0`.**
- A8: No information by color alone (presence, message status, call status all carry text/icon).
- A9: Stub controls are **not** hidden from assistive tech; their "Coming soon" state is announced.

---

## 8. Non-Goals (this round)

**Explicit non-goals:**
- Native Swift/iOS app, SwiftUI, Xcode, App Store distribution.
- A rewrite or framework migration. v3 is layout + cleanup on the existing vanilla-JS app.
- New features. The feature catalog (§5) is frozen for v3.
- Real authentication backend: passwords, OTP delivery, OAuth, account recovery. (Auth screens present but **[STUB]**.)
- End-to-end / Signal-protocol encryption (transport is HTTPS/WSS only).
- Real group **media** relay; TURN/SFU infrastructure.
- External LLM / Claude API calls. All AI stays **local & deterministic**.

**Still limited / deferred (→ [STUB] or [ROADMAP]):**
- Real ML media (virtual background, beauty filter, auto-framing, noise cancellation, captions, emotion/gesture).
- Background push when the app is closed (Web Push reliability varies by browser) — [ROADMAP].
- OS-level call UI (CallKit) & system ringtone — in-app only.
- Note lock via biometrics — PIN is the future path.
- Media at scale (image/video/voice/file storage + delivery; location/contact sharing).

> v3 removed several "infeasible on iOS Safari" caveats from v2 because the product now targets normal desktop + mobile browsers. Screen share, for example, is feasible on desktop and is merely a [STUB] this round rather than infeasible.

---

## 9. Success metrics (acceptance for v3)

- **Responsive:** every view passes **AC-GLOBAL-RESPONSIVE** — sidebar + two-pane chat on desktop, single-column + bottom tabs on mobile, clean reflow with no horizontal scroll.
- **iOS-specifics removed:** Apple-only meta tags, the zoom lock, and iPhone-only framing are gone (see `web_app_conversion.md` checklist); the app no longer reads as an iPhone-shaped column on desktop.
- **Persistence:** passes **AC-GLOBAL-PERSIST** — conversations, messages, notes, call logs survive server restart + browser reload (verified against the SQLite file).
- **Delivery:** loads over HTTPS at **https://bevane.loca.lt**; the WebSocket connects over **`wss`** through the tunnel; chat and calls work end-to-end through the tunnel.
- **Completeness intact:** 100% of §5 features still represented (WORKING functional, STUB labeled "Coming soon"); zero silent dead buttons; all prior [WORKING] features still pass their criteria.
- **Accessibility:** WCAG 2.1 AA checklist (§7) satisfied, including desktop keyboard navigation.
- **No external API keys**; AI runs offline.
