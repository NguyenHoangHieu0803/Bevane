# Bevane — User Stories

**Author:** Business Analyst Agent
**Date:** 2026-06-16
**Version:** 2.0 (Full-spec expansion)

Persona: **A user** is anyone who has opened the Bevane PWA (via QR-code URL / Add to Home Screen) and set up a lightweight identity (display name + server-generated id).

**Tag convention:** **[WORKING]** = fully functional. **[STUB]** = control present + labeled, gives "Coming soon" feedback.
**Stub acceptance-criteria template (AC-STUB):** *Given the feature's screen, the control is present, has an accessible label, and on activation shows clear "Coming soon" feedback (announced via `aria-live`), without breaking navigation or appearing dead.*

---

## Epic 0: Onboarding, Auth & Identity

### US-0.1 — Splash & Welcome **[STUB]**
**As** a new user, **I want** a branded splash + welcome screen, **so that** the app feels native on launch.
**AC:** Splash shows on launch (and as the PWA standalone splash); Welcome offers "Get started" / "Log in"; both navigate forward. (AC-STUB applies to non-functional auth bits.)

### US-0.2 — Sign Up (lightweight identity) **[WORKING]**
**As** a new user, **I want** to enter a display name and start, **so that** I can communicate without an account.
**AC:** Non-empty name → server issues an id → app opens; identity persists across reloads; empty/whitespace name → inline, screen-reader-announced error, blocked.

### US-0.3 — Log In **[STUB]**
**As** a returning user, **I want** to log in, **so that** I resume my identity.
**AC:** If a stored identity exists, the user resumes the app; the credential login form is present but **AC-STUB** (no password/credential backend).

### US-0.4 — OTP verification **[STUB]**
**As** a user, **I want** to verify via a one-time code.
**AC:** AC-STUB — OTP screen present with input cells; "Verify" proceeds with a "Coming soon" notice (no real code is sent/checked).

### US-0.5 — Set Profile **[STUB]** (display name **[WORKING]**)
**As** a user, **I want** to set my name and avatar before entering.
**AC:** Display-name capture works and feeds identity; avatar picker is present but AC-STUB.

### US-0.6 — Discover & select a peer **[WORKING]**
**As** a user, **I want** to see other users + online status, **so that** I can pick someone.
**AC:** Contacts list shows names + online/offline (text+icon, not color alone); selecting a peer opens/creates a conversation.

---

## Epic 1: Messaging

### US-1.1 — Send a text message **[WORKING]**
**AC:** Typing + send shows the message immediately with status "sent"; empty/whitespace blocked.

### US-1.2 — Receive messages in real time **[WORKING]**
**AC:** Peer's message appears within ~1s and is announced via `aria-live`.

### US-1.3 — Conversation history **[WORKING]**
**AC:** Reopening a conversation loads all prior messages in chronological order.

### US-1.4 — Typing indicator **[WORKING]**
**AC:** Indicator shows while peer composes; clears on stop/send.

### US-1.5 — Message status (sent/delivered/seen) **[WORKING]**
**AC:** Status advances sent → delivered (peer online) → seen (peer views); shown with text/icon.

### US-1.6 — Group chat **[STUB]**
**As** a user, **I want** to chat with 3+ people in one thread.
**AC:** "New group" entry + group thread variant are present; **AC-STUB** for send/participants this round (minimal backend group concept may exist but UI is stubbed).

### US-1.7 — React to a message **[STUB]**
**As** a user, **I want** to add ❤️😂👍😮😢🙏 to a message.
**AC:** Reaction picker appears in the message action menu; **AC-STUB**.

### US-1.8 — Reply / Forward / Delete-unsend / Pin **[STUB]**
**AC:** Each action exists in the per-message menu, labeled; **AC-STUB** for each.

### US-1.9 — Search in conversation **[STUB]**
**AC:** Search control present in the chat header; **AC-STUB**.

### US-1.10 — Send media (image/video/voice/file/location/contact) **[STUB]**
**AC:** Composer attach menu lists all six media types, each labeled; **AC-STUB**.

### US-1.11 — Smart reply (AI) **[WORKING]**
**AC:** 2–4 short suggestions for the latest received message; tappable to insert; offline.

### US-1.12 — Tone adjuster / Auto-translate / Chat summary / Spam detection (AI) **[STUB]**
**AC:** Each AI action is present (composer or chat menu), labeled; **AC-STUB** unless its `src/ai.js` endpoint is delivered, in which case it returns deterministic output labeled AI-generated.

---

## Epic 2: Voice Calling

### US-2.1 — Start a voice call **[WORKING]**
**AC:** Peer online → tap "Voice call" → they get an incoming event, I see ringing/calling state.

### US-2.2 — Receive a voice call **[WORKING]**
**AC:** Incoming call shows accept/decline (announced via `aria-live`); accept = two-way audio; decline logs declined.

### US-2.3 — In-call controls: mute + hang up **[WORKING]**
**AC:** Mute/unmute and hang up work; hang up returns both to idle.

### US-2.4 — Duration timer **[WORKING]**
**AC:** A live elapsed timer runs while connected.

### US-2.5 — Call history (missed/received/dialed) **[WORKING]**
**AC:** History lists entries newest-first with direction/status shown via text+icon and duration.

### US-2.6 — Ringtone / Speaker / Hold / Switch-to-video / Add participant / Group voice / DND **[STUB]**
**AC:** Each control is present in the call UI (or Profile settings for DND/ringtone), labeled; **AC-STUB**.

### US-2.7 — Missed-call notification **[STUB]**
**AC:** In-app missed indicator is present; system push notification is [ROADMAP]; **AC-STUB** for push.

### US-2.8 — Call AI (noise cancel / transcription / post-call summary / emotion) **[STUB]**
**AC:** Each is a labeled toggle/action on the call screen; **AC-STUB**.

---

## Epic 3: Video Calling

### US-3.1 — Start a video call **[WORKING]**
**AC:** Peer online → tap "Video call" → they get an incoming event; I see a calling state with my self-preview.

### US-3.2 — Receive a video call **[WORKING]**
**AC:** Accept = two-way audio+video (remote + self-preview); decline logs declined.

### US-3.3 — In-call controls: mute / camera toggle / hang up **[WORKING]**
**AC:** All three work and are labeled for VoiceOver.

### US-3.4 — Video call logging **[WORKING]**
**AC:** Each attempt logs peer, type=video, status, start time, duration.

### US-3.5 — Switch camera / Group grid / Screen share / Virtual bg / Beauty / PiP / Quality / Recording **[STUB]**
**AC:** Each control is present in the video overlay, labeled; **AC-STUB**. (Screen share unsupported on iOS Safari — [ROADMAP] there.)

### US-3.6 — Video AI (virtual bg / auto-framing / captions / low-light / gesture) **[STUB]**
**AC:** Each is a labeled toggle on the video screen; **AC-STUB** (ML items also [ROADMAP]).

---

## Epic 4: Notes (with AI)

### US-4.1 — Manage personal notes (CRUD) **[WORKING]**
**AC:** Create/edit/delete a note (title+body); listed most-recent-first.

### US-4.2 — Generate note from a conversation (AI) **[WORKING]**
**AC:** "Generate note" produces a deterministic summary + action items offline, saved as a new note labeled AI-generated.

### US-4.3 — Smart replies (AI) **[WORKING]**
**AC:** (Cross-listed in Epic 1.) 2–4 offline suggestions for the latest message.

### US-4.4 — Rich text / Folders / Pin / Search / Color labels / Checklist / Image / Voice-to-note / Reminder / Share-PDF / History / Lock **[STUB]**
**AC:** Each control is present in the list or editor (or its sub-screen: checklist, reminder, lock), labeled; **AC-STUB**. Recommended schema columns may exist but UI behavior is stubbed.

### US-4.5 — Notes AI (write assistant / auto-summarize / smart tags / grammar / action-items / ask-about-note) **[STUB]**
**AC:** Each AI action is present in the editor toolbar, labeled; **AC-STUB** unless its `src/ai.js` endpoint is delivered, in which case it returns deterministic output labeled AI-generated.

---

## Epic 5: Profile

### US-5.1 — View profile **[WORKING]** (edit **[STUB]**)
**AC:** Profile tab shows avatar slot, display name, and identity; display name is visible; edit is AC-STUB.

### US-5.2 — Personal QR / Scan QR **[STUB]**
**AC:** Profile shows a "My QR" view and a "Scan QR" action, both labeled; **AC-STUB**.

### US-5.3 — Change password / Notification settings / Logout **[STUB]**
**AC:** Each is a labeled Profile row; **AC-STUB** (logout may functionally clear local identity if implemented).

---

## Cross-cutting: Accessibility (applies to every story, WORKING and STUB)
- Every interactive control (including stubs and bottom-tab icons) is keyboard-operable, has a visible focus state and a descriptive `aria-label`.
- Incoming messages, incoming calls, and "Coming soon" feedback are announced via `aria-live`.
- Status/presence/quality never rely on color alone.
- Touch targets ≥ 44×44 px; contrast meets WCAG 2.1 AA.
