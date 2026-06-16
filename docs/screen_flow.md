# Bevane — Screen Flow & Navigation

**Author:** Business Analyst Agent · **Date:** 2026-06-16 · **Version:** 2.0

Legend: `→` next/forward · `⇄` back-and-forth · `[STUB]` labeled, "Coming soon" · `[WORKING]` functional.

---

## 1. Onboarding / Auth flow

```
Splash [STUB visual]
  → Welcome [STUB]
       → Sign Up [WORKING: display-name identity]
       → Log In  [STUB]
            → OTP verify [STUB]
                 → Set Profile [STUB avatar / WORKING name]
                      → Home (bottom tabs)
```

```
[ Splash ] → [ Welcome ] → [ Sign Up ] ─┐
                         → [ Log In  ] ─┤→ [ OTP ] → [ Set Profile ] → [ HOME ]
```

Notes:
- Splash also serves as the PWA standalone splash (Add to Home Screen).
- Only **Sign Up** performs the real identity call; the other steps are navigable stubs.

---

## 2. Home — bottom tab bar

```
┌─────────────────────────────────────────────┐
│                  (active screen)            │
│                                             │
├───────────┬───────────┬──────────┬──────────┤
│   Chats   │   Calls   │  Notes   │ Profile  │
│ [WORKING] │ [WORKING] │[WORKING]│  [tab]   │
└───────────┴───────────┴──────────┴──────────┘
```

All four tabs are always reachable; each hosts working + stubbed sub-features.

---

## 3. Chats tab

```
Chat List [WORKING]
  ├─ "New group" → Group Chat [STUB]
  └─ select conversation → 1:1 Chat [WORKING]
         ├─ header: search [STUB] · voice-call [WORKING] · video-call [WORKING]
         ├─ message → action menu: react [STUB] · reply [STUB] · forward [STUB]
         │             · pin [STUB] · delete/unsend [STUB]
         ├─ composer: attach-menu [STUB: image/video/voice/file/location/contact]
         │             · tone-adjust [STUB] · translate [STUB] · send [WORKING]
         └─ AI: smart-reply [WORKING] · chat-summary [STUB] · spam-flag [STUB]
```

```
Chat List ─ select ─→ 1:1 Chat ⇄ (action menu / attach menu / AI panel)
Chat List ─ new group ─→ Group Chat [STUB]
```

---

## 4. Calls tab

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
   │            · switch-camera [STUB] · screen-share [STUB] · virtual-bg [STUB]
   │            · beauty [STUB] · record [STUB] · quality-indicator [STUB]
   ├─ PiP mode [STUB]
   └─ AI: captions [STUB] · auto-framing [STUB] · low-light [STUB] · gesture [STUB]
```

```
Active Video Call ⇄ PiP [STUB]
Active Video Call ─ (hang up) ─→ Call History (logged) [WORKING]
```

---

## 6. Notes tab

```
Notes List [WORKING]
  ├─ folder filter [STUB] · search [STUB] · pin [STUB] · color labels [STUB]
  ├─ "New note" / select → Note Editor [WORKING: title+body CRUD]
  │     ├─ toolbar: rich-text [STUB]
  │     ├─ AI: write-assist [STUB] · summarize [STUB] · smart-tags [STUB]
  │     │       · grammar [STUB] · action-items [STUB] · ask-about-note [STUB]
  │     ├─ → Checklist sub-screen [STUB]
  │     ├─ → Reminder sub-screen [STUB]
  │     ├─ → Lock (Face ID/PIN) sub-screen [STUB]
  │     ├─ image [STUB] · voice-to-note [STUB] · share/export-PDF [STUB] · history [STUB]
  │     └─ delete [WORKING]
  └─ "Generate note from chat" (AI) [WORKING]
```

```
Notes List ─ select/new ─→ Note Editor ⇄ (Checklist / Reminder / Lock sub-screens)
Notes List ─ generate ─→ AI note created [WORKING]
```

---

## 7. Profile tab

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
- Bottom tab bar is persistent on all four Home tabs.
- Back navigation returns to the parent screen without losing identity/session.
- Activating any **[STUB]** control shows "Coming soon" feedback (announced via `aria-live`) and never blocks navigation.
