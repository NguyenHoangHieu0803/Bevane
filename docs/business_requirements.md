# Bevane — Business Requirements Document

**Author:** Business Analyst Agent
**Date:** 2026-06-16
**Version:** 2.0 (Full-spec expansion — "full spec, stubs allowed")
**Status:** Baseline for Backend handoff v2
**Supersedes:** v1.0 (Demo scope)

---

## 0. How to read this document

This is a **full product spec**. To keep the build honest, **every feature is tagged**:

- **[WORKING]** — implemented end-to-end and functional today (delivered in Round 1, or trivially extended this round).
- **[STUB]** — must be **represented in the UI this round** as a clearly-labeled control that gives **"Coming soon" feedback**. Never a silent dead button. No real backend behavior required yet.
- **[ROADMAP]** — planned for a future phase; not required in the UI this round (may appear in settings/roadmap text only). See `ROADMAP.md`.

**Scope strategy (binding):** EVERY feature listed in this document must be **represented** in the UI. Features that already work stay functional; everything else ships as a clearly-labeled stub. This gives a complete, navigable product surface that demos the full vision while being buildable from a Linux environment.

---

## 1. Vision

Bevane is a private, mobile-first communication app: **chat, voice call, video call, and AI-assisted notes** between people, with a lightweight onboarding flow and a personal profile/QR identity. A user scans a QR code, the app opens in iOS Safari, and (via Add to Home Screen) runs full-screen like a native app — **no App Store install**.

### Vision statement
> "Scan a code, set up a profile, and instantly chat, call, video, and take smart notes — privately, accessibly, and installable to your home screen, with no App Store and no API keys."

---

## 2. Delivery decision — PWA, enhanced to feel native (NOT native iOS)

**Decision (already approved by the Agent Teams Lead):** Bevane is delivered as an **installable, mobile-first Progressive Web App (PWA)**, enhanced to feel native — NOT a native Swift/iOS app.

**The intended "native-feeling" install flow:**
1. User scans the Bevane **QR code**.
2. The QR opens the public **HTTPS URL in Safari**.
3. User taps **Share → Add to Home Screen**.
4. The app launches **full-screen / standalone** with a **splash screen** and app icon, indistinguishable from a native app to most users.

**Why not a native Swift/iOS app (documented rationale):**
- This product is built and distributed from a **Linux environment**. Xcode, the iOS SDK, code signing, and the App Store pipeline are **not available** on Linux — a native build cannot be produced here.
- **iOS forbids QR-code auto-install** of apps. A QR code cannot silently install a native app; only the App Store (or enterprise MDM) can. A web URL, by contrast, opens instantly from a QR.
- App Store **review and developer-account** requirements add days-to-weeks of latency and cost, incompatible with an instant-link demo.

**What the PWA approach gives us:** instant access via link/QR, home-screen install, standalone full-screen UI, offline-capable shell (service worker), and same-origin delivery of the entire app from one Node server. **WebRTC** provides native-quality voice/video in the browser.

**What the PWA approach cannot do on iOS Safari (documented limits — see §8 Non-Goals):** background push when fully closed (limited), true OS-level call UI (CallKit), screen recording of other apps, virtual-camera injection, on-device ML acceleration parity, and Face ID API access for app-level locking. These constraints are why several advanced AI/media features are **[STUB]/[ROADMAP]**.

---

## 3. Agreed Technical Stack (binding for the whole team)

| Layer | Technology |
|-------|-----------|
| Backend | Node.js + Express + `ws` (WebSocket) + `better-sqlite3` (local SQLite) |
| Transport | REST APIs (HTTP) + a single WebSocket channel for real-time chat **and** WebRTC signaling |
| Frontend | Vanilla-JS PWA (no heavy framework), mobile-first, served same-origin by the Node server |
| Install | Web App Manifest + service worker + splash/icon assets ("Add to Home Screen") |
| Real-time media | WebRTC (browser-native) for voice and video |
| AI | Local, **deterministic, offline** helper (`src/ai.js`) — no external API key, no network |
| Distribution | Public HTTPS URL surfaced as a QR code |

---

## 4. Navigation & app structure

Onboarding then a **4-tab bottom navigation**. Full flow in `screen_flow.md`.

```
Splash → Welcome → Sign Up / Log In → OTP verify → Set Profile → Home
Home bottom tabs:  [ Chats ]  [ Calls ]  [ Notes ]  [ Profile ]
```

- **Auth/Onboarding:** Splash, Welcome, Sign Up, Log In, OTP, Set Profile. (Identity remains lightweight; auth screens present, OTP/password are **[STUB]** this round — see `auth_and_profile.md`.)
- **Chats tab:** chat list → 1:1 chat → group chat.
- **Calls tab:** call history → outgoing/active/incoming call → video active/PiP.
- **Notes tab:** notes list → editor → checklist/reminder/lock sub-screens.
- **Profile tab:** avatar, display name, personal QR, scan QR, change password, notification settings, logout.

---

## 5. Feature catalog (all four areas + auth/profile)

Per-feature one-line specs live in `feature_specs/*.md`. This section is the master catalog with tags.

### 5.1 Messaging — see `feature_specs/messaging.md`

**Core**
- 1:1 real-time text chat — **[WORKING]**
- Conversation history persistence — **[WORKING]**
- Typing indicator — **[WORKING]**
- Presence (online/offline) — **[WORKING]**
- Message status: sent / delivered / seen — **[WORKING]**
- Group chat (3+ participants) — **[STUB]** (minimal backend group concept this round; UI stubbed)
- Reactions (❤️ 😂 👍 😮 😢 🙏) — **[STUB]** (schema fields recommended; UI stubbed)
- Reply (quote a message) — **[STUB]**
- Forward message — **[STUB]**
- Delete / unsend message — **[STUB]** (`deleted` field recommended)
- Pin message — **[STUB]**
- Search in conversation — **[STUB]**
- Media: image / video / voice / file / location / contact — **[STUB]**

**AI (offline, deterministic)**
- Smart reply suggestions — **[WORKING]**
- Tone adjuster (rewrite draft in a chosen tone) — **[STUB]** (new `src/ai.js` endpoint recommended)
- Auto-translate message — **[STUB]** (simple deterministic endpoint)
- Chat summary — **[STUB]** (new endpoint)
- Spam / scam detection — **[STUB]**

### 5.2 Calling (audio) — see `feature_specs/calling.md`

**Core**
- 1:1 WebRTC voice call (invite/accept/decline/end) — **[WORKING]**
- Mute / unmute mic — **[WORKING]**
- Call duration timer — **[WORKING]**
- Call history (missed / received / dialed) — **[WORKING]**
- Call logging (type/status/duration) — **[WORKING]**
- Ringtone on incoming call — **[STUB]** (basic tone optional; full ringtone stubbed)
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
- Post-call summary — **[STUB]** (can reuse a deterministic summary endpoint)
- Emotion detection — **[STUB]**

### 5.3 Video Calling — see `feature_specs/video_calling.md`

**Core**
- 1:1 WebRTC video call (invite/accept/decline/end) — **[WORKING]**
- Mute mic / camera on-off / hang up — **[WORKING]**
- Local self-preview + remote view — **[WORKING]**
- Switch front / rear camera — **[STUB]** (feasible via `getUserMedia` facingMode; stubbed this round)
- Group grid layout (3+) — **[STUB]**
- Screen share — **[STUB]** (desktop browsers support `getDisplayMedia`; iOS Safari does not — [ROADMAP] on iOS)
- Virtual background — **[STUB]** (ML — [ROADMAP])
- Beauty filter — **[STUB]**
- Picture-in-Picture (PiP) — **[STUB]**
- Connection-quality indicator — **[STUB]**
- Call recording — **[STUB]** (server-side/group recording is [ROADMAP])

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
- Folders / categories — **[STUB]** (`folder` column recommended)
- Pin note — **[STUB]** (`pinned` column recommended)
- Search notes — **[STUB]**
- Color labels — **[STUB]** (`color` column recommended)
- Checklist items — **[STUB]** (`checklist` column recommended)
- Image attachment — **[STUB]**
- Voice-to-note — **[STUB]**
- Reminder — **[STUB]** (`reminder_at` column recommended; system alarm is [ROADMAP])
- Share / export PDF — **[STUB]**
- History / versions — **[STUB]**
- Lock (Face ID / PIN) — **[STUB]** (`locked` column; Face ID unavailable on web — PIN feasible later, [ROADMAP])

**AI (offline, deterministic)**
- Generate note from conversation (summary + action items) — **[WORKING]**
- Write assistant — **[STUB]**
- Auto-summarize a note — **[STUB]** (new endpoint)
- Smart tags — **[STUB]** (new endpoint)
- Grammar check — **[STUB]**
- Action-item extractor — **[STUB]** (new endpoint)
- Ask AI about this note — **[STUB]** (new endpoint)

### 5.5 Auth & Onboarding & Profile — see `feature_specs/auth_and_profile.md`

**Onboarding/Auth**
- Splash screen — **[STUB]** (visual; ties to PWA splash)
- Welcome screen — **[STUB]**
- Sign Up (display name → identity) — **[WORKING]** (lightweight identity from Round 1, surfaced as Sign Up)
- Log In (return to existing identity) — **[STUB]** (re-entry via stored identity works; credential login stubbed)
- OTP verification — **[STUB]**
- Set Profile (display name + avatar) — **[STUB]** (display name works; avatar stubbed)

**Profile tab**
- Avatar — **[STUB]**
- Display name (view/edit) — **[WORKING]** (view; edit may be [STUB])
- Personal QR (others scan to add as contact) — **[STUB]**
- Scan QR (add a contact) — **[STUB]**
- Change password — **[STUB]**
- Notification settings — **[STUB]**
- Logout — **[STUB]** (clearing local identity is feasible; surfaced as a labeled control)

---

## 6. Acceptance criteria (cross-feature rules)

Detailed per-feature acceptance criteria live in `user_stories.md`. Two global rules:

- **AC-GLOBAL-WORKING:** A [WORKING] feature behaves per its acceptance criteria in `user_stories.md`, end-to-end, between two browser tabs and two devices.
- **AC-GLOBAL-STUB:** Every [STUB] feature **has a visible, labeled control** in the correct screen. Activating it shows clear **"Coming soon"** feedback (toast/inline/sheet) and never appears broken, never silently does nothing, and never blocks navigation.

---

## 7. Accessibility requirements (WCAG 2.1 AA — applies to WORKING and STUB)

- A1: Semantic HTML landmarks (header/nav/main/footer); single H1 per view.
- A2: All interactive controls keyboard-operable with a visible focus indicator.
- A3: All non-text controls (call, mic/camera, send, reactions, tab bar icons) have descriptive `aria-label`s readable by VoiceOver.
- A4: Live regions (`aria-live`) announce new incoming messages, incoming calls, and "Coming soon" stub feedback.
- A5: Color contrast ≥ 4.5:1 normal text, ≥ 3:1 large text / UI components.
- A6: Form inputs (sign up, OTP, profile, note editor) have associated `<label>`s; errors announced programmatically.
- A7: Touch targets ≥ 44×44 px (mobile-first), including the bottom tab bar and reaction picker.
- A8: No information by color alone (presence, message status, call status, quality indicator all carry text/icon).
- A9: Stub controls are **not** hidden from assistive tech; their "Coming soon" state is announced.

---

## 8. Non-Goals & infeasible-on-web items (this round)

**Explicit non-goals this round:**
- Native Swift/iOS app, SwiftUI, Xcode, App Store distribution.
- Real authentication backend: passwords, OTP delivery (SMS/email), OAuth, account recovery. (Auth screens are present but **[STUB]**.)
- End-to-end / Signal-protocol message encryption (transport is HTTPS/WSS only).
- Real group **media** relay (group calls beyond signaling stubs); TURN/SFU infrastructure.
- External LLM / Claude API calls or anything requiring an API key or network beyond the signaling server. All AI stays **local & deterministic**.

**Known infeasible / heavily-limited on iOS Safari (→ [STUB] or [ROADMAP]):**
- **Screen sharing** — `getDisplayMedia` is unsupported on iOS Safari.
- **Background push when app fully closed** — iOS Web Push is limited and unreliable; treat as [ROADMAP].
- **OS-level call UI (CallKit) & system ringtone** — not exposed to web; in-app ringtone only.
- **Face ID for app lock** — no web API; lock via PIN is a future option.
- **Real ML media** — virtual background, beauty filter, auto-framing, noise cancellation, emotion/gesture recognition require on-device ML models we are not shipping this round → [STUB]/[ROADMAP].
- **Virtual camera / true recording of remote streams** — not feasible from web reliably → [STUB]/[ROADMAP].

---

## 9. Success metrics (acceptance for v2)

- **Completeness:** 100% of features in §5 are represented in the UI (WORKING functional, STUB labeled with "Coming soon").
- **No dead controls:** zero silent dead buttons — every stub announces "Coming soon".
- **Working features intact:** all Round-1 [WORKING] features still pass their acceptance criteria.
- **Navigability:** full screen flow (`screen_flow.md`) traversable on a phone; bottom tabs functional.
- **Accessibility:** WCAG 2.1 AA checklist (§7) satisfied across WORKING and STUB controls.
- **Install:** loads via QR → Safari → Add to Home Screen → full-screen standalone with splash.
- **No external API keys**; AI runs offline.
