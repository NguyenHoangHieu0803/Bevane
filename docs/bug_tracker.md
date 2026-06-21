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

---

# ROUND 2 (v2) findings — final gate, 2026-06-16

**No Critical or High defects found in v2.** The user's two burn scenarios were re-audited and both are safe:
- **Black-screen / overlay-hijack:** PASS. `[hidden]{display:none !important}` (styles.css:34) is the only `!important` display rule; every overlay (#splash via JS, #onboarding, #peer-picker, #attach-sheet, #group-dialog, #qr-dialog, #editname-dialog, #call-overlay, dynamic #msg-action-sheet) is hidden at boot; `boot()` and its `.catch()` both call `hideSplash()`.
- **Dead buttons:** PASS. 0 unwired controls. 72 static buttons + all dynamic buttons trace to a real handler or `comingSoon()`.

## BUG-004 — none. (No new bug. Note kept for traceability.)
- v2 backend regression (REST + 21/21 WS), 9/9 new endpoints, note round-trip, static integrity, a11y all passed. No fix applied this round.

## OBS-001 — profile-qr-btn upgraded from stub to working
- **Severity:** Info (positive deviation from handoff)
- **Status:** Closed / Not-a-bug
- **Detail:** Frontend handoff 07 listed "My QR code" as a stub. In the shipped code `profile-qr-btn` actually renders a real QR via bundled `vendor/qrcode.js` (`openQr`), with a `comingSoon('My QR code')` fallback on failure. No dead button either way.

## OBS-002 — Message reactions / reply / unsend are client-only by design
- **Severity:** Info / known-limitation (matches Backend handoff 06 §3)
- **Status:** Closed / by-design
- **Detail:** Reaction sheet, reply quote-bar, and "Unsend for everyone" are optimistic/local stubs (backend has the columns but no setters this round). Unsend/forward route to `comingSoon`; local reactions/reply are visual-only. Not wired to non-existent endpoints. Correct per spec.

## OBS-003 — Group messaging is a local-only stub
- **Severity:** Info / by-design
- **Detail:** Group create+list are server-backed; opening a group thread routes its sends to `comingSoon` (no `chat:send` for group ids). Correct per Backend handoff §4.

## OBS-004 — Reminder firing & note-lock enforcement are frontend-owned
- **Severity:** Info / known-limitation
- **Detail:** `reminderAt` and `locked` persist server-side (round-trip verified) but firing/enforcement is best-effort client-side per spec. Not a release blocker; lock is not a security control.

## v2 carried caveats (GO-with-caveats)
- WebRTC live media (getUserMedia / P2P audio-video) is not headlessly testable — signaling relay fully verified (21/21); confirm two-tab media in a real browser before public demo.
- PWA install / standalone launch / offline shell — markup + manifest + sw.js (`bevane-shell-v3`) correct; confirm once on-device over HTTPS.

---

## ROUND 3 — Web App Conversion findings

**No Critical / High / Medium defects.** Round 3 was a CSS-driven responsive
conversion + iOS-bit removal over the same DOM. All v3 acceptance criteria verified.
Items below are minor observations and carried caveats.

### OBS-R3-001 (Low / minor a11y) — tab/tabpanel pairing
The sidebar and mobile nav use `role="tablist"`/`role="tab"` with `aria-controls`
pointing at the views, but the views are `<section class="view">` without
`role="tabpanel"`. The tablist→tab→panel relationship is therefore not strictly
complete per the ARIA tabs pattern. Selection state (`aria-selected`), labels,
roving tabindex, and arrow-key nav are all correct, so the nav is fully operable and
announced; this is a polish item, not a barrier. **Not fixed** (non-blocking,
behavior-neutral; flagged for a future a11y pass).

### Verified-OK (Round 3, explicitly tested)
- **Persistence across `kill -9` restart** — SQLite counts and REST re-listings
  identical before/after (users 15, conversations 7, messages 10, notes 7,
  call_logs 3). AC-GLOBAL-PERSIST holds; QC re-verified independently of the handoff.
- **No black screen** — `[hidden]{display:none!important}` intact; no competing
  `!important` display rule; `boot().catch(hideSplash)`; sidebar/`#thread-empty`
  shown by CSS only (cannot stick).
- **No dead buttons** — 63 interactive buttons + attach/filter/notif/folder controls
  all wired (real handler, form submit, or `comingSoon()`); 0 unwired.
- **iOS bits removed** — apple meta tags, `maximum-scale`, `viewport-fit=cover` gone;
  viewport allows zoom; manifest has no orientation/apple tokens; webrtc.js wording
  generalized.
- **Two-pane logic correct** — list pane hidden on thread/editor open **only when
  `!isTwoPane()`**; `onTwoPaneChange` re-reveals/re-hides on breakpoint crossing; no
  path blanks the content area.
- **Integrity** — 17/17 JS parse; all named imports resolve; `sw.js` = `bevane-shell-v4`.

### v3 carried caveats (GO-with-caveats)
- **Responsive verified statically + structurally only** — DOM, CSS media queries
  (768/1024px), and breakpoint-aware JS audited; no headless browser. Confirm the
  actual desktop two-pane / tablet icon-rail / mobile single-column rendering and the
  live resize behavior in a real browser + on a device before the public demo.
- **WebRTC live media** — unchanged from v2; signaling 21/21 verified; needs two real
  clients for getUserMedia / P2P audio-video.
- **loca.lt interstitial** — the public tunnel shows a one-time click-through
  interstitial; not an app defect but expect it on first load at `bevane.loca.lt`.
- **PWA install / offline shell** — markup + manifest + `sw.js v4` correct; confirm
  on-device over HTTPS.

---

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
