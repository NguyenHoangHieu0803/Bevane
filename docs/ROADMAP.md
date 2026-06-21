# Bevane — Roadmap

**Author:** Business Analyst Agent · **Date:** 2026-06-16 · **Version:** 3.0

Phased plan tying every feature to a delivery phase. Tags: **[WORKING]** done · **[STUB]** represented this round · **[ROADMAP]** future.

---

## v3 — Web App conversion (this round, UI/layout + cleanup, NO new features)

**Goal:** reframe Bevane from "mobile/iOS-PWA" to a **general responsive Web Application** (desktop + mobile browsers). Not a rewrite. The feature catalog is frozen; tags unchanged. See `web_app_conversion.md`, `business_requirements.md` §2, and `communication-history/09_BA_to_Backend_v3.md`.

- **Responsive redesign (Frontend):** desktop-first layout — **left sidebar nav + content**; **Chats = two-pane (list | thread)** on wide screens; collapses to **single-column + bottom tab bar** on mobile (`<768px`). Breakpoints: desktop ≥1024, tablet 768–1023, mobile <768. No iPhone-shaped column.
- **Strip iOS specifics (Frontend):** remove `apple-mobile-web-app-*` meta tags, the `maximum-scale=1.0` zoom lock, and iPhone-only safe-area/notch framing; stop depending on `apple-touch-icon`; generalize "Add to Home Screen on iOS" copy and iOS-only WebRTC wording. Stays installable, just not iOS-targeted.
- **Delivery:** served over HTTPS at **https://bevane.loca.lt** (localtunnel → Node server); WebSocket over **`wss`** must work through the tunnel proxy. Same-origin (no CORS needed).
- **Persistence (Backend verify + document):** messages, conversations, notes, call logs all in **SQLite**, surviving **server restart + browser reload + WS reconnect**. Explicit acceptance test in `web_app_conversion.md` (d).
- **Accessibility (Frontend):** desktop keyboard navigation of sidebar + two-pane chat; remove zoom lock; preserve all v2 WCAG 2.1 AA guarantees.

---

## Phase 0 — Done (Round 1, [WORKING])
- Lightweight identity (display name + server id); contacts list + presence.
- 1:1 real-time messaging: send/receive, history, typing, presence, sent/delivered/seen status.
- 1:1 WebRTC voice call: invite/accept/decline/end, mute, duration timer, call history & logging.
- 1:1 WebRTC video call: invite/accept/decline/end, mute, camera toggle, self-preview + remote, logging.
- Notes CRUD; AI generate-note (summary + action items) and smart-reply — offline & deterministic.
- PWA shell, WCAG 2.1 AA baseline.

## Phase 1 — This round (full surface; mostly [STUB])
**Goal:** EVERY feature represented in the UI; stubs labeled with "Coming soon"; working features intact.

- **PWA native-feel:** splash, manifest, Add-to-Home-Screen standalone, app icon.
- **Onboarding/Auth surface:** Splash, Welcome, Sign Up (working), Log In, OTP, Set Profile.
- **Bottom tabs:** Chats / Calls / Notes / **Profile** (new tab).
- **Messaging stubs:** group chat, reactions, reply, forward, delete/unsend, pin, search, media (image/video/voice/file/location/contact).
- **Messaging AI stubs:** tone adjuster, auto-translate, chat summary, spam detection. *(Optional working: tone-adjust, translate, chat-summary, if backend ships endpoints.)*
- **Calling stubs:** ringtone, speaker, hold, switch-to-video, add participant, group voice, DND, missed-call notification (in-app); AI: noise cancel, transcription, post-call summary, emotion.
- **Video stubs:** switch camera, group grid, screen share, virtual bg, beauty, PiP, quality indicator, recording; AI: virtual bg, auto-framing, captions, low-light, gesture.
- **Notes stubs:** rich text, folders, pin, search, color labels, checklist, image, voice-to-note, reminder, share/export PDF, history, lock; AI: write assistant, auto-summarize, smart tags, grammar, action-items, ask-about-note. *(Optional working: note-summarize, smart-tags, action-items, ask-about-note via backend.)*
- **Profile stubs:** avatar, edit name, personal QR, scan QR, change password, notification settings, logout.
- **Light backend support (this round):** minimal `groups` concept; message `reactions`/`reply_to`/`deleted` fields; note `folder`/`pinned`/`color`/`reminder_at`/`locked`/`checklist` columns; new deterministic `src/ai.js` endpoints. See `communication-history/05_BA_to_Backend_v2.md`.

## Phase 2 — Near future ([ROADMAP])
- Make selected stubs real: group chat send/fan-out, reactions persistence + live updates, reply/forward, delete/unsend, pin, in-chat search, note folders/pin/color/checklist/reminder/search, rich text.
- Switch front/rear camera (facingMode), PiP, connection-quality indicator (real `getStats`).
- In-app ringtone + missed-call badges; DND preference enforcement.
- Avatar upload; editable profile; personal-QR add-contact + QR scan to add.
- More AI endpoints made real & expanded (translate languages, write assistant, grammar).

## Phase 3 — Advanced / infeasible-on-web today ([ROADMAP])
- **Real ML media:** virtual background, beauty filter, auto-framing, noise cancellation, live captions/transcription, emotion & gesture recognition (on-device models).
- **Group media at scale:** SFU/TURN for 3+ party voice/video; call & screen recording.
- **Screen sharing on iOS** (currently unsupported in iOS Safari).
- **System push notifications** when the app is closed (reliable iOS Web Push).
- **Note lock via Face ID** (no web API) — interim PIN lock possible in Phase 2.
- **Media at scale:** image/video/voice/file storage + delivery; location/contact sharing.

## Phase 4 — Out of scope / different product ([ROADMAP], may never happen here)
- **Native Swift/iOS app** + App Store distribution — not buildable from this Linux environment; iOS forbids QR auto-install. PWA remains the delivery vehicle.
- End-to-end encryption (Signal-protocol).
- Real auth backend: password storage, OTP via SMS/email, OAuth, account recovery.
