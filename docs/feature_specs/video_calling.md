# Feature Spec — Video Calling

**Area:** Calls tab (video variant). **Screens:** video active → PiP → incoming video.
Tags: **[WORKING]** · **[STUB]** · **[ROADMAP]**.

## Core features

| Feature | One-line spec | Tag |
|---------|---------------|-----|
| 1:1 video call | WebRTC audio+video call: invite → accept/decline → connected → end. | **[WORKING]** |
| Mute mic | Toggle microphone during a video call. | **[WORKING]** |
| Camera on/off | Toggle the local camera. | **[WORKING]** |
| Hang up | End the call; both sides return to idle. | **[WORKING]** |
| Self-preview + remote | Local self-view + remote participant video. | **[WORKING]** |
| Switch front/rear camera | Flip camera via `getUserMedia` facingMode. | **[STUB]** (feasible later) |
| Group grid | 3+ participants in a grid layout. | **[STUB]** |
| Screen share | Share the device screen into the call. | **[STUB]** (iOS Safari unsupported → [ROADMAP] on iOS) |
| Virtual background | Replace/blur the background. | **[STUB]** (ML → [ROADMAP]) |
| Beauty filter | Smoothing/retouch filter on local video. | **[STUB]** |
| Picture-in-Picture | Keep call video in a floating window. | **[STUB]** |
| Quality indicator | Show connection quality (good/poor) with text+icon. | **[STUB]** |
| Recording | Record the call. | **[STUB]** (server/group recording [ROADMAP]) |

## AI features

| Feature | One-line spec | Tag |
|---------|---------------|-----|
| Virtual background (segmentation) | ML person-segmentation backdrop. | **[STUB]** / **[ROADMAP]** |
| Auto-framing | Keep the speaker centered. | **[STUB]** / **[ROADMAP]** |
| Live captions | On-screen captions of speech. | **[STUB]** |
| Low-light enhancement | Brighten dim video. | **[STUB]** |
| Gesture recognition | Detect hand gestures (e.g., wave/thumbs-up). | **[STUB]** / **[ROADMAP]** |

## Notes for Frontend
- Video control overlay: mute + camera toggle + hang up (working); switch-camera, screen-share, virtual-bg, beauty, PiP, record (stubs).
- Quality indicator renders as a labeled badge; stubbed value acceptable.
- Tapping a stub control shows "Coming soon" without disrupting the active call.
