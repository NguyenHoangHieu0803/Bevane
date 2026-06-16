# Bevane — Bug Tracker (QA/QC gate)

**Agent:** QA/QC Full-Stack Agent
**Date:** 2026-06-16
**Severity scale:** Critical (breaks core feature / crashes) · High · Medium · Low

No **Critical** or **High** defects were found. The build passed 42/42 REST,
21/21 WebSocket, and all static + accessibility checks. The items below are
low-severity observations and verified-non-issues recorded for completeness.

---

## BUG-001 — AI note title uses owner's name, not the peer's
- **Severity:** Low (cosmetic)
- **Status:** Open (flagged, not fixed — behavior change is product-ambiguous)
- **Area:** `src/ai.js` `generateNote()` → `peerName` selection.
- **Observed:** When Alex (the requester/owner) generates a note from a chat with
  Bob, the note title is `"Summary — chat with Alex"` instead of `"…with Bob"`.
  The title picks the first participant whose name isn't "Someone", which is
  whichever participant sent the first message (Alex here), not the peer.
- **Expected (per BA §4 / Backend handoff example):** `"Summary — chat with Bob"`.
- **Impact:** Title only; the summary body, action items, `source:"ai"`, and
  persistence are all correct and the note is clearly labeled AI-generated. Does
  not affect any acceptance criterion's pass (AC-N3 requires summary+action items
  from the conversation, which works).
- **Why not auto-fixed:** A correct fix needs the requester's `ownerId` passed into
  `generateNote` to pick "the other participant" — a signature change touching
  `server.js` and the AI module. Per the "keep fixes minimal / flag larger or
  ambiguous changes" rule, this is flagged rather than patched. Suggested fix:
  pass `ownerId` and choose `participantNames` for the id `!== ownerId`.

## BUG-002 — `node --check` false-positives on ES-module frontend files
- **Severity:** Low (tooling artifact, not a code defect)
- **Status:** Closed / Not-a-bug
- **Detail:** Root `package.json` is `"type":"commonjs"` (correct — the backend uses
  `require`). The `public/js/*.js` files are browser ES modules loaded via
  `<script type="module">`. Plain `node --check` parses them as CommonJS and
  reports spurious `Unexpected token 'export'`. Re-checked with module input-type
  (matching the browser) → all 11 pass. No action needed.

## BUG-003 — WebRTC media path not headlessly testable
- **Severity:** Low / informational
- **Status:** Closed / Known-limitation (matches Frontend handoff "Known limitations")
- **Detail:** Actual peer-to-peer audio/video (getUserMedia, RTCPeerConnection)
  requires a real browser and a reachable network path (STUN only, no TURN). The
  automated suite fully verifies the **signaling relay** (the server's only job):
  invite→incoming, offer/answer/ice relayed verbatim, offline→unavailable. Live
  two-tab media must be confirmed manually in a browser before a public demo — this
  is the one acceptance item not provable by automated QA and is called out as a
  GO caveat.

## Verified-OK (explicitly tested, no defect)
- Conversation get-or-create is idempotent across swapped user order (no duplicate).
- Empty/whitespace messages rejected on both REST and WS paths.
- `durationSec` computed correctly (60 for completed span; 0 for missed/declined;
  recomputed to 0 when PATCHed to declined).
- AI endpoints make **no** network calls / need no API key (offline AC-N4 holds).
- All 5 SQLite tables created idempotently on a fresh DB.
- Unknown `/api/*` routes return JSON 404 (do not fall through to the SPA shell).
- Server remained healthy throughout the full test run (no crashes, no unhandled
  errors in the log).
