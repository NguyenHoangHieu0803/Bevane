# Feature Spec — Calling (Audio)

**Area:** Calls tab. **Screens:** call history → outgoing/active → incoming.
Tags: **[WORKING]** · **[STUB]** · **[ROADMAP]**.

## Core features

| Feature | One-line spec | Tag |
|---------|---------------|-----|
| 1:1 voice call | WebRTC audio call: invite → accept/decline → connected → end. | **[WORKING]** |
| Mute / unmute | Toggle the local microphone during a call. | **[WORKING]** |
| Duration timer | Live elapsed-time counter while connected. | **[WORKING]** |
| Call history | List of missed / received / dialed calls, newest first. | **[WORKING]** |
| Call logging | Each attempt logged with peer, type, status, duration. | **[WORKING]** |
| Ringtone | Audible ringtone on incoming call. | **[STUB]** (basic tone optional) |
| Speaker toggle | Route audio to speaker/earpiece. | **[STUB]** |
| Hold | Place the active call on hold. | **[STUB]** |
| Switch to video | Upgrade an audio call to video mid-call. | **[STUB]** |
| Add participant | Pull a third person into the call. | **[STUB]** |
| Group voice call | 3+ party audio call. | **[STUB]** |
| Missed-call notification | Alert the user of a missed call. | **[STUB]** (in-app badge feasible; system push [ROADMAP]) |
| Do Not Disturb | Silence/decline incoming calls while on. | **[STUB]** |

## AI features

| Feature | One-line spec | Tag |
|---------|---------------|-----|
| Noise cancellation | Suppress background noise on the mic. | **[STUB]** (real ML denoise [ROADMAP]) |
| Live transcription | Real-time speech-to-text of the call. | **[STUB]** |
| Post-call summary | Summarize what was discussed after hang-up. | **[STUB]** (can reuse a deterministic summary endpoint) |
| Emotion detection | Infer caller sentiment during the call. | **[STUB]** |

## Notes for Frontend
- Active-call screen hosts the in-call control row: mute (working), speaker/hold/add/switch-to-video (stubs), end (working).
- Call history rows use direction icons + text labels (missed/received/dialed) — not color alone.
- DND and ringtone preferences surface in Profile → Notification settings (stubbed).
