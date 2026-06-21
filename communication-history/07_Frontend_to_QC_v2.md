# 07 — Frontend Developer → QA/QC Agent (Round 2 handoff)

- **From:** Frontend Developer Agent (build completed; closeout finalized by Agent Teams Lead after a session-limit interruption)
- **To:** QA/QC Full-Stack Agent
- **Date:** 2026-06-16
- **Subject:** v2 UI expansion ready for the final quality gate — full BA spec represented, working core + labeled stubs, native-feel PWA

## Summary

The PWA in `/public` was expanded to represent the **entire** v2 BA spec. Navigation was restructured to the BA flow: bottom tabs are now **Chats / Calls / Notes / Profile** (Video is folded into the Calls log and launched from a chat/call, not a top-level tab). A **splash screen** and a **Profile tab** were added. Everything backed by the round-2 backend is functional; everything else is a **labeled stub** that calls `comingSoon(label)` (toast + live-region announcement) — there are **no silent dead buttons by design**.

Code against `backend/api_specs.md`. The single module entry point is `/js/app.js`; all features are wired in `boot()`.

## TWO guarantees you must verify (the user was burned by these)

1. **No black screen / overlay hijack.** The critical fix `[hidden] { display: none !important; }` (top of `public/css/styles.css`) is intact. On load the order is **splash → onboarding → app shell (Chats)**. `#call-overlay`, `#onboarding`, `#splash`, `.modal`, `#attach-sheet` must be invisible unless explicitly shown. `boot()` has a safety `.catch()` that always hides the splash.
2. **No dead buttons.** Every non-functional control routes to `comingSoon()`. Audit every `<button>` / `[role=tab]`: it must have a real handler **or** call `comingSoon()`.

## Feature map — WORKING vs STUB

### 💬 Messaging
- **WORKING:** 1:1 realtime chat (WS), typing indicator, sent/delivered/seen, presence, history; **emoji reactions** (long-press/tap message → reaction sheet, optimistic/local); **reply** (quote bar); **message search** (client-side filter over loaded messages); **delete for me** (local removal); **AI smart-reply**; **AI tone-adjust** on the draft (`/api/ai/tone-adjust`); **AI chat-summary** (`/api/ai/chat-summary`); **AI translate** an incoming message (`/api/ai/translate`).
- **STUB (comingSoon):** unsend-for-everyone, forward, media attach (image/video/voice/file/location/contact), spam detection.

### 📞 / 🎥 Calls (voice + video, in Calls tab)
- **WORKING:** voice & video WebRTC (STUN), mute, end, call log with missed (red) / received / dialed; **switch front/rear camera** where the device supports it (else comingSoon).
- **STUB (comingSoon):** speaker toggle, hold, add participant, switch-to-video mid-call, picture-in-picture (attempts real PiP API, falls back to comingSoon), group calls.

### 📝 Notes
- **WORKING:** create/edit/delete; **folders/categories** (All/Work/Personal/+New via `note.folder`); **pin** (`note.pinned`); **search**; **color labels** (`note.color`); **checklist mode** (`note.checklist`); **reminder** (saves `note.reminder_at`; firing is best-effort/not a native notification); **AI generate-note**, **note-summarize**, **smart-tags**, **action-items**, **ask-AI-about-note**.
- **STUB (comingSoon):** grammar check, rich-text formatting, attach image, voice-to-note, export/share PDF, Face ID / PIN lock.

### 👤 Profile / Auth
- **WORKING:** display name shown, **log out** (clears identity → onboarding). Onboarding is name-only (no password/OTP — those screens are roadmap).
- **STUB (comingSoon):** My QR code (a `vendor/qrcode.js` generator is bundled but the button is currently stubbed — easy next win), Scan QR, avatar upload, change password, notification-setting toggles.

### Groups
- **WORKING:** create a group (`POST /api/groups`) and list groups.
- **STUB:** group messaging itself (`comingSoon`), since backend group messaging is storage-only this round.

## Native-feel PWA
- Splash screen overlay on launch; `manifest.webmanifest` standalone; apple meta tags + touch icon; safe-area insets respected.
- `sw.js` cache bumped to **`bevane-shell-v3`** and its `SHELL` now includes the new modules (`profile.js`, `groups.js`, `reactions.js`, `ai-tools.js`, `vendor/qrcode.js`).

## New modules
`profile.js`, `groups.js`, `reactions.js`, `ai-tools.js`, `vendor/qrcode.js`; `calllog.js` now exposes `loadCalls` (combined voice+video log); `ui.js` adds `comingSoon()`. All named imports resolve to real exports (verified).

## Accessibility additions
aria-labels on all new icon controls; reaction sheet & attach sheet are dialogs with focus handling; folder tabs and notification toggles are labeled; `comingSoon()` announces via the live region; ≥44px targets; contrast unchanged (AA tokens).

## Acceptance criteria for QC's gate
1. Server boots clean; round-1 features still pass (regression).
2. All 7 new AI endpoints return valid responses from the UI paths; note new-field round-trip works.
3. **No black screen** on load; overlays hidden until invoked.
4. **No dead buttons** — every control has a handler or `comingSoon()`.
5. WCAG AA spot-check passes on the new UI.
6. Issue your **GO / NO-GO** verdict in `08_QC_Final_Report_v2.md`.
