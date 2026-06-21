# Handoff 09 — BA → Backend (v3)

**From:** Business Analyst Agent
**To:** Backend Developer Agent
**Date:** 2026-06-16
**Subject:** Round-3 Web App conversion — verify the server is host/origin-agnostic behind the bevane.loca.lt tunnel, and **verify + document conversation/data persistence in SQLite**. Almost no new backend code; the conversion is mostly Frontend.

---

## TL;DR

Round 3 reframes Bevane from "mobile/iOS-PWA" to a **general responsive Web
Application** (desktop + mobile browsers), served over HTTPS at
**https://bevane.loca.lt** (a localtunnel pointing at the running Node server).
**The API contract in `backend/api_specs.md` does not change. No new features.**

Your Round-3 work is small and almost entirely **verification + documentation**:

1. **Confirm the server is host/origin-agnostic** and works behind the
   `bevane.loca.lt` tunnel (bind `0.0.0.0`, no hardcoded host, respect
   `process.env.PORT`, WS upgrade survives the proxy, permissive CORS only *if*
   actually needed).
2. **Verify and document conversation/data persistence** — messages,
   conversations, notes, and call logs survive a **server restart**. Query the
   SQLite file and show the evidence.
3. **Remove any iOS-specific server assumptions** (we expect there are **none** —
   confirm).
4. Hand off to Frontend at **`communication-history/10_Backend_to_Frontend_v3.md`**,
   noting that the bulk of the conversion (responsive layout + stripping iOS meta
   tags) is **Frontend** work.

Reference docs updated this round: `docs/business_requirements.md` (v3, see §2),
`docs/web_app_conversion.md` (NEW), `docs/screen_flow.md` (v3), `docs/ROADMAP.md`
(v3 entry).

---

## Context: the app is already a web app

There is **no native iOS/Swift code** and never was. "Converting from iOS" means
removing iOS-PWA-specific bits in the **frontend** and making the layout responsive.
The backend (Node/Express + `ws` + better-sqlite3) is already a normal web server.
So your job is mostly to **prove** it behaves correctly behind a public HTTPS tunnel
and that data persists.

From my read of `server.js`, the server already:
- binds `const HOST = '0.0.0.0'` and `server.listen(process.env.PORT || 3000, HOST, …)`,
- serves the static frontend + `/api/*` + `/ws` **same-origin**,
- derives nothing from a hardcoded host.

Please confirm this still holds and close the gaps below.

---

## 1. Host / origin / tunnel readiness — VERIFY

The reference deployment is `localtunnel --port <PORT> --subdomain bevane`
→ **https://bevane.loca.lt**. Verify each:

- **Bind address:** server binds `0.0.0.0` (not `127.0.0.1`/`localhost`). ✔ expected — confirm.
- **Port:** respects `process.env.PORT`; tunnel points at that port. ✔ expected — confirm.
- **No hardcoded host/origin** anywhere in REST or WS code. Confirm by grep.
- **WebSocket upgrade through the proxy:** the `Upgrade`/`Connection` handshake on
  `/ws` must succeed through localtunnel over **`wss`**. The client derives
  `wss://bevane.loca.lt/ws` from `location` (page is HTTPS → `wss`). Test a real
  connect through the tunnel and confirm `auth` → `auth:ok` and a chat round-trip.
  - If `ws`/Express needs `app.set('trust proxy', true)` or any header passthrough
    to work behind the proxy, add the minimal change and document it.
- **CORS:** because the frontend is served **same-origin** by this server, CORS
  should **not** be needed. **Do not** add permissive CORS unless a real
  cross-origin need appears. If you do add it, keep it minimal and say why.
- **HTTPS/WSS:** the tunnel terminates TLS; the Node server itself stays HTTP/WS
  behind it. Confirm nothing in the app forces `http`/`ws` or rejects forwarded
  proto.

---

## 2. Persistence — VERIFY **and DOCUMENT** (this is the important one)

**Requirement (binding, from `business_requirements.md` §2.4 / AC-GLOBAL-PERSIST):**
All conversations and user data are persisted in SQLite and **survive server
restart, browser reload, and WS reconnect.** Entities: **messages, conversations,
notes, call logs, users.**

Please run and **document** this acceptance test in your Frontend handoff:

1. Start the server. As user A, send several messages to user B; create a note;
   complete a voice call (so a call log is written).
2. **Stop and restart the Node server** (`data/bevane.db` is on disk; WAL files too).
3. Re-list via the existing endpoints and confirm everything returns:
   - `GET /api/conversations?userId=A` → conversation present, `lastMessage` intact.
   - `GET /api/conversations/:id/messages` → all messages, same order/content.
   - `GET /api/notes?ownerId=A` → the note present.
   - `GET /api/calls?userId=A` → the call log present.
4. Query the SQLite file directly and paste counts/rows as evidence, e.g.:
   ```
   sqlite3 data/bevane.db "select count(*) from messages;"
   sqlite3 data/bevane.db "select count(*) from conversations;"
   sqlite3 data/bevane.db "select count(*) from notes;"
   sqlite3 data/bevane.db "select count(*) from call_logs;"   # use the actual table name
   ```
   (Use the real table names from your schema; list them with `.tables`.)
5. Note the **WAL** files (`bevane.db-wal`, `bevane.db-shm`) — confirm a clean
   shutdown/checkpoint isn't required for data to survive (better-sqlite3 default
   journaling is durable, but document the behavior so Frontend/QC can trust it).

Document in `10_Backend_to_Frontend_v3.md`: the table list, the row counts before
and after restart, and a one-line confirmation that nothing is held only in memory
that the UI depends on after reload. (Reminder: `online` presence **is** in-memory
and correctly derived live — that's fine and expected; it's not "lost data".)

---

## 3. iOS-specific server assumptions — REMOVE (expected: none)

Grep the backend for any iOS/Apple/Safari-only assumptions (we expect **none**):
- No `apple-*` headers, no iOS-only user-agent branching, no `playsinline`-type
  server logic, no Safari-specific WebRTC handling (signaling is a dumb relay).
- If you find anything, remove/generalize it. If nothing, state "none found".

---

## 4. What you do NOT need to do

- No API changes. `backend/api_specs.md` is frozen for v3 — do not change shapes.
- No new endpoints, no schema changes, no new features.
- No layout/UI work — that's Frontend.
- No CORS unless a genuine cross-origin need is proven (it shouldn't be).

---

## Acceptance criteria (Backend, v3)

- **AC-B1 (tunnel):** App reachable at `https://bevane.loca.lt`; static frontend,
  `/api/*`, and `/ws` all served from that origin. Documented.
- **AC-B2 (wss):** A WebSocket client connects over `wss://bevane.loca.lt/ws`
  through the tunnel, completes `auth → auth:ok`, and a chat message round-trips
  (send → `chat:new` echo + delivery). Documented (with any `trust proxy`/header
  change noted).
- **AC-B3 (no hardcoded host):** grep shows no hardcoded host/port/origin; binds
  `0.0.0.0`; respects `process.env.PORT`. Confirmed.
- **AC-B4 (persistence):** messages, conversations, notes, and call logs all
  survive a **server restart** and reload — verified via the REST endpoints **and**
  direct SQLite queries; row counts/evidence pasted into the Frontend handoff.
- **AC-B5 (no iOS server bits):** grep confirms no iOS/Apple-specific server logic
  (or any found is removed). Stated explicitly.
- **AC-B6 (no contract drift):** `backend/api_specs.md` unchanged; all v1/v2
  endpoints still behave identically (quick regression).

---

## Next handoff

When done, write **`communication-history/10_Backend_to_Frontend_v3.md`** to the
**Frontend Developer Agent**. Tell Frontend:
- The server is tunnel-ready (origin-agnostic, `wss` works) — they can rely on
  same-origin relative `/api/...` and `wss://<host>/ws` (no hardcoding).
- The persistence evidence (so Frontend/QC can cite it).
- That **the bulk of the v3 conversion is theirs**: responsive redesign (sidebar +
  two-pane chat → single-column + bottom tabs) and stripping iOS specifics
  (`apple-mobile-web-app-*` meta tags, `maximum-scale=1.0` zoom lock, iPhone-only
  safe-area framing, `apple-touch-icon` dependence, "Add to Home Screen on iOS"
  copy). Point them at `docs/web_app_conversion.md` (the concrete checklist + layout)
  and `docs/business_requirements.md` §2.

— BA
