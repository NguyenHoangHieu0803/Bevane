# Bevane — Screen Flow & Navigation

**Author:** Business Analyst Agent · **Date:** 2026-06-16 · **Version:** 3.0 (responsive web)

Legend: `→` next/forward · `⇄` back-and-forth · `[STUB]` labeled, "Coming soon" · `[WORKING]` functional.

> **v3:** Bevane is a **responsive web app** (desktop + mobile browsers). The same
> four destinations render as a **left sidebar on desktop** and a **bottom tab bar
> on mobile**. The **Chats** view is **two-pane (list | thread)** on desktop and
> **list → thread** on mobile. See `web_app_conversion.md` for the layout spec.

---

## 1. Onboarding / Auth flow (same on all screen sizes)

```
Splash [STUB visual]
  → Welcome [STUB]
       → Sign Up [WORKING: display-name identity]
       → Log In  [STUB]
            → OTP verify [STUB]
                 → Set Profile [STUB avatar / WORKING name]
                      → Home
```

```
[ Splash ] → [ Welcome ] → [ Sign Up ] ─┐
                         → [ Log In  ] ─┤→ [ OTP ] → [ Set Profile ] → [ HOME ]
```

Notes:
- Only **Sign Up** performs the real identity call; the other steps are navigable stubs.
- Splash is a normal web splash (no iOS Add-to-Home-Screen framing in v3).

---

## 2. Home — primary navigation (responsive)

**Desktop (≥1024px): left sidebar.**
```
┌──────────┬───────────────────────────────────────────────┐
│  Bevane  │                                                │
│  ● Chats │             (active destination)               │
│    Calls │                                                │
│    Notes │                                                │
│  Profile │                                                │
│  ────────│                                                │
│  [ me ]  │                                                │
└──────────┴───────────────────────────────────────────────┘
```

**Mobile (<768px): bottom tab bar (current behavior).**
```
┌─────────────────────────────────────────────┐
│                (active view)                │
├───────────┬───────────┬──────────┬──────────┤
│   Chats   │   Calls   │  Notes   │ Profile  │
└───────────┴───────────┴──────────┴──────────┘
```

The sidebar and the tab bar are the **same logical nav** (one shows per breakpoint).
All four destinations are always reachable; each hosts working + stubbed sub-features.

---

## 3. Chats

**Desktop — two-pane (list | thread):**
```
┌──────────────┬──────────────────────────────────────────┐
│ Conversation │  Open thread [WORKING]                    │
│ list         │   header: search [STUB] · voice [WORKING] │
│ [WORKING]    │           · video [WORKING]               │
│  ├ peer A ●  │   messages ⇄ action menu (react/reply/    │
│  ├ peer B    │            forward/pin/delete) [STUB]      │
│  └ + new grp │   composer: attach [STUB] · tone [WORKING] │
│    [STUB]    │            · translate [WORKING]           │
│              │            · send [WORKING]                │
│  (empty →    │   AI: smart-reply [WORKING] ·             │
│  "Select a   │       chat-summary [WORKING] · spam [STUB] │
│  conversation")                                           │
└──────────────┴──────────────────────────────────────────┘
```
Selecting a conversation opens it in the **thread pane** without leaving the list.

**Mobile — list → thread (full-screen, Back):**
```
Chat List [WORKING] ─ select ─→ 1:1 Chat [WORKING] ⇄ (Back to list)
Chat List ─ new group ─→ Group Chat [STUB]
```

---

## 4. Calls

```
Call History [WORKING: missed / received / dialed]
  ├─ tap entry / contact → Outgoing Call (calling…) [WORKING]
  │        → Active Voice Call [WORKING]
  │             controls: mute [WORKING] · speaker [STUB] · hold [STUB]
  │                       · add-participant [STUB] · switch-to-video [STUB]
  │                       · timer [WORKING] · end [WORKING]
  │             AI: noise-cancel [STUB] · transcription [STUB]
  │                 · post-call-summary [STUB] · emotion [STUB]
  └─ incoming → Incoming Call (accept/decline) [WORKING]
```
- **Desktop:** the call surface is a centered overlay sized for desktop (not a phone strip).
- **Mobile:** full-screen call overlay (current behavior).

```
Call History ─→ Outgoing ─→ Active Voice Call ─→ (end) ─→ Call History
Call History ←─ Incoming Call (accept/decline)
```

---

## 5. Video calling

```
(from chat or call) → Outgoing Video → Active Video Call [WORKING]
   ├─ grid (group) [STUB]
   ├─ controls: mute [WORKING] · camera-toggle [WORKING] · hang-up [WORKING]
   │            · switch-camera [STUB] · screen-share [STUB*] · virtual-bg [STUB]
   │            · beauty [STUB] · record [STUB] · quality-indicator [STUB]
   ├─ PiP mode [STUB]
   └─ AI: captions [STUB] · auto-framing [STUB] · low-light [STUB] · gesture [STUB]
```
`*` screen-share is now feasible on desktop (`getDisplayMedia`); still [STUB] this round.

```
Active Video Call ⇄ PiP [STUB]
Active Video Call ─ (hang up) ─→ Call History (logged) [WORKING]
```
- **Desktop:** video uses available content width; self-preview is a corner inset.

---

## 6. Notes

```
Notes List [WORKING]
  ├─ folder filter [STUB] · search [STUB] · pin [STUB] · color labels [STUB]
  ├─ "New note" / select → Note Editor [WORKING: title+body CRUD]
  │     ├─ toolbar: rich-text [STUB]
  │     ├─ AI: write-assist [STUB] · summarize [WORKING] · smart-tags [WORKING]
  │     │       · grammar [STUB] · action-items [WORKING] · ask-about-note [WORKING]
  │     ├─ → Checklist sub-screen [STUB]
  │     ├─ → Reminder sub-screen [STUB]
  │     ├─ → Lock (PIN) sub-screen [STUB]
  │     ├─ image [STUB] · voice-to-note [STUB] · share/export-PDF [STUB] · history [STUB]
  │     └─ delete [WORKING]
  └─ "Generate note from chat" (AI) [WORKING]
```
- **Desktop (recommended):** two-pane — notes list | editor side-by-side (same pattern as Chats).
- **Mobile:** list → editor (full-screen, Back).

```
Notes List ─ select/new ─→ Note Editor ⇄ (Checklist / Reminder / Lock sub-screens)
Notes List ─ generate ─→ AI note created [WORKING]
```

---

## 7. Profile

```
Profile
  ├─ Avatar [STUB]
  ├─ Display name [WORKING view] → Edit Profile [STUB]
  ├─ My QR (others scan to add me) [STUB]
  ├─ Scan QR (add a contact) [STUB]
  ├─ Change password [STUB]
  ├─ Notification settings [STUB] (messages / calls / DND / ringtone)
  └─ Logout [STUB] (clears local identity)
```

```
Profile ─→ Edit Profile [STUB]
Profile ─→ My QR [STUB] ⇄ Scan QR [STUB]
Profile ─→ Notification settings [STUB]
Profile ─→ Logout → Welcome
```

---

## 8. Global navigation rules
- Primary nav is **persistent**: a **left sidebar on desktop**, a **bottom tab bar on mobile** — same destinations.
- Layout **reflows by breakpoint** (desktop ≥1024 / tablet 768–1023 / mobile <768) with no horizontal scroll and no clipped controls.
- Back navigation returns to the parent screen without losing identity/session. On desktop two-pane Chats, "back" is implicit (the list is always visible).
- Activating any **[STUB]** control shows "Coming soon" feedback (announced via `aria-live`) and never blocks navigation.
- All conversations, messages, notes, and call logs **persist** (SQLite) and reappear after reload/restart/reconnect.
