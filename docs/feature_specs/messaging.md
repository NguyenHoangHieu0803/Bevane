# Feature Spec — Messaging

**Area:** Chats tab. **Screens:** chat list → 1:1 chat → group chat.
Tags: **[WORKING]** functional today · **[STUB]** present + "Coming soon" · **[ROADMAP]** future.

## Core features

| Feature | One-line spec | Tag |
|---------|---------------|-----|
| 1:1 text chat | Send/receive real-time text over WebSocket between two users. | **[WORKING]** |
| History persistence | Conversation reloads full ordered history on open/reload. | **[WORKING]** |
| Typing indicator | Shows when the peer is composing; clears on stop/send. | **[WORKING]** |
| Presence | Peer online/offline shown with text+icon (not color alone). | **[WORKING]** |
| Message status | Each sent message shows sent → delivered → seen. | **[WORKING]** |
| Empty-message guard | Whitespace-only messages are rejected. | **[WORKING]** |
| Group chat | Conversation with 3+ participants; group title + member list. | **[STUB]** (minimal backend `groups` concept this round) |
| Reactions | Long-press a message to attach ❤️😂👍😮😢🙏. | **[STUB]** (recommend `reactions` field) |
| Reply | Quote-reply to a specific message. | **[STUB]** (recommend `reply_to` field) |
| Forward | Forward a message to another conversation. | **[STUB]** |
| Delete / unsend | Remove for self or unsend for everyone. | **[STUB]** (recommend `deleted` field) |
| Pin message | Pin an important message to the top of the chat. | **[STUB]** |
| Search in chat | Find text within a conversation. | **[STUB]** |
| Media — image | Attach/send an image. | **[STUB]** |
| Media — video | Attach/send a video clip. | **[STUB]** |
| Media — voice | Record and send a voice message. | **[STUB]** |
| Media — file | Attach/send an arbitrary file. | **[STUB]** |
| Media — location | Share current/picked location. | **[STUB]** |
| Media — contact | Share a contact card. | **[STUB]** |

## AI features (offline, deterministic via `src/ai.js`)

| Feature | One-line spec | Tag |
|---------|---------------|-----|
| Smart reply | 2–4 short suggested replies to the latest received message. | **[WORKING]** |
| Tone adjuster | Rewrite a draft in a chosen tone (friendly/formal/concise). | **[STUB]** (recommend `/api/ai/tone-adjust`) |
| Auto-translate | Translate a message to a target language (simple/deterministic). | **[STUB]** (recommend `/api/ai/translate`) |
| Chat summary | Summarize a conversation into key points. | **[STUB]** (recommend `/api/ai/chat-summary`) |
| Spam / scam detection | Flag a message as likely spam/scam with a reason. | **[STUB]** |

## Notes for Frontend
- The chat composer should host stubbed entry points (attach menu, tone, translate) as labeled buttons that emit "Coming soon".
- Reaction picker and reply/forward/pin live in a per-message action menu (all stubbed except none yet working).
- Group chat appears as a "New group" action in the chat list and a group thread variant.
