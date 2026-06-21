# Handoff 10 — Backend → Frontend (v3)

**From:** Backend Developer Agent
**To:** Frontend Developer Agent
**Date:** 2026-06-16
**Subject:** Round-3 Web App conversion — server is tunnel-ready (origin-agnostic, `wss` works through `bevane.loca.lt`), persistence verified across a hard restart. **No backend code changed; the API contract is frozen.** The bulk of the conversion is yours (responsive layout + stripping iOS-specific frontend bits).

---

## TL;DR

- The server needed **no code changes** for v3 — it was already host/origin-agnostic
  and the persistence layer is durable. This handoff is verification + the
  guarantees you can rely on.
- You can code against **relative `/api/...`** and a socket URL **derived from
  `location`** (`wss://<host>/ws` when the page is HTTPS). **Hardcode nothing.**
- The full v1/v2 API contract in `backend/api_specs.md` is **unchanged** — no shape
  drift, no new endpoints, no schema changes.
- Your job: the responsive redesign and removing iOS-PWA-specific frontend bits.
  See `docs/web_app_conversion.md` (concrete checklist + layout) and
  `docs/business_requirements.md` §2.

---

## 1. Tunnel / wss readiness — VERIFIED (you can rely on this)

Reference deployment: `localtunnel --port <PORT> --subdomain bevane` →
**https://bevane.loca.lt**, pointing at the Node server on `process.env.PORT`.

- **Same-origin.** `/`, `/api/*`, and `/ws` are all served by the one Node process
  from the same origin → **no CORS** is configured or needed. Keep using relative
  `fetch('/api/...')`.
- **WebSocket URL.** Derive it from `location` — do **not** hardcode:
  ```js
  const proto = location.protocol === 'https:' ? 'wss' : 'ws';
  const ws = new WebSocket(`${proto}://${location.host}/ws`);
  ```
  On the tunnel the page is HTTPS, so this resolves to `wss://bevane.loca.lt/ws`.
- **Upgrade passes through the proxy.** The `ws` server attaches to the same HTTP
  server at `path: '/ws'` with **no Origin allow-list / no `verifyClient`**, so the
  tunnel's forwarded `Upgrade` handshake is accepted. Verified by connecting with
  `Origin: https://bevane.loca.lt` + `X-Forwarded-Proto: https` — upgrade succeeds.
- **No forced proto / no `trust proxy`.** The server reads nothing from
  `req.secure`/`req.protocol`/`req.ip` and forces no scheme. TLS terminates at the
  tunnel; Node stays HTTP/WS behind it. `app.set('trust proxy', …)` is **not** set
  (nothing needs it).
- **Reconnect.** After a server restart the socket will drop; reconnect with the
  same `auth` frame (`{ type: 'auth', userId }`) → `auth:ok`, then resume. Presence
  re-broadcasts on reconnect. (Implement your existing reconnect/backoff; the server
  side is ready.)

**WS smoke test:** `node tests/ws_smoke.js` against a running server — **21/21 pass**
(auth → auth:ok + presence, chat:send → chat:new to both parties + delivered/read
receipts, typing relay, full WebRTC `call:*`/`webrtc:*` relay, offline → unavailable,
unauthed/unknown-frame rejection). This is the exact relay you ride over `wss`.

---

## 2. Persistence guarantee — VERIFIED (cite this to QC)

**All conversations and user data are persisted in SQLite and survive server
restart, browser reload, and WS reconnect.** Nothing the UI depends on after reload
is held only in memory.

- **Storage:** `data/bevane.db` (`better-sqlite3`, **WAL** mode; `bevane.db-wal` +
  `bevane.db-shm` sit alongside). Override path with `BEVANE_DB`.
- **Tables:** `users`, `conversations`, `messages`, `notes`, `call_logs`, `groups`,
  `group_members`.
- **Re-list endpoints (all return after reload):**
  - `GET /api/conversations?userId=A` → conversation present, `lastMessage` intact.
  - `GET /api/conversations/:id/messages` → all messages, same order/content.
  - `GET /api/notes?ownerId=A` → notes present.
  - `GET /api/calls?userId=A` → call logs present.
- **Durable even on a hard kill.** WAL journaling does not require a clean
  shutdown/checkpoint for data to survive. Verified with `kill -9`.
- **`online` presence is in-memory** (WS-connected set) and derived live per
  request — that is correct and expected, **not** lost data.

### Evidence (acceptance test, actual output)

Seeded over REST: 2 users (Alice, Bob), 1 conversation, 3 messages, 1 note,
1 completed voice call. Then the server process was **`kill -9`'d** and a **new
process** booted against the same DB file.

Direct SQLite counts (`sqlite3 data/bevane.db`), before and after the hard restart:

```
                BEFORE          AFTER (new process)
users           2               2
conversations   1               1
messages        3               3
notes           1               1
call_logs       1               1
```

REST re-listings, **before** restart:
```
GET /api/conversations?userId=A   -> [{ peer:"Bob", last:"How are you?" }]
GET /api/conversations/:id/messages -> count=3 ["Hi Bob","Hey Alice","How are you?"]
GET /api/notes?ownerId=A          -> count=1 ["Groceries"]
GET /api/calls?userId=A           -> count=1 [{ type:"voice", status:"completed", dur:45 }]
```

REST re-listings, **after** the `kill -9` restart (identical):
```
GET /api/conversations?userId=A   -> [{ peer:"Bob", last:"How are you?" }]
GET /api/conversations/:id/messages -> count=3 ["Hi Bob","Hey Alice","How are you?"]
GET /api/notes?ownerId=A          -> count=1 ["Groceries"]
GET /api/calls?userId=A           -> count=1 [{ type:"voice", status:"completed", dur:45 }]
```

The server also boots clean against an existing DB (idempotent migration; no errors).

---

## 3. iOS-specific server logic — NONE (nothing to remove server-side)

Grepped the backend for `apple|ios|safari|playsinline|user-agent|webkit`:
**none found.** No Apple headers, no iOS user-agent branching, no Safari-specific
WebRTC handling (signaling is a dumb relay). The server is fully cross-browser.

**All iOS-specific work in v3 is in the FRONTEND.** Per `docs/web_app_conversion.md`
§(a), remove/generalize (all of these live in `public/` + docs, none server-side):

1. `<meta name="apple-mobile-web-app-capable">` — **remove** (optionally replace with
   the standard `<meta name="mobile-web-app-capable" content="yes">`).
2. `<meta name="apple-mobile-web-app-status-bar-style" …>` — **remove**.
3. `<meta name="apple-mobile-web-app-title" content="Bevane">` — **remove**
   (manifest `name`/`short_name` covers it).
4. `<link rel="apple-touch-icon" …>` — optional to keep, but **must not** be the
   only/primary install icon; the manifest `icons` (192/512, maskable) are canonical.
5. `maximum-scale=1.0` in the viewport meta — **remove** the zoom lock (WCAG /
   accessibility). Keep `width=device-width, initial-scale=1.0`.
6. `viewport-fit=cover` + `env(safe-area-inset-*)` used to shape the whole app as a
   phone — **generalize** (safe-area padding may remain on mobile but must not drive
   the desktop layout).
7. The iPhone-shaped **centered single-column** frame — **replace** with the
   responsive layout in §(b): desktop = full-width sidebar + content (two-pane chat),
   mobile = single column + bottom tab bar.
8. `<video playsinline>` documented as an "iOS Safari" requirement — **keep**
   `playsinline` but **re-document** it as standard cross-browser inline video.
9. iOS-only WebRTC comments/assumptions — **generalize** wording (user-gesture before
   `getUserMedia` is good cross-browser practice; screen share is now feasible on
   desktop).
10. Any "Add to Home Screen on iOS" / Share-sheet onboarding copy — **generalize or
    remove**; installability via manifest stays, no longer iOS-targeted.
11. `apple-touch-icon.png` listed as load-bearing in the SW precache / ARCHITECTURE —
    keep caching it (harmless) but docs must not present it as required.

Authoritative checklist + the target responsive layout (desktop ≥1024 / tablet
768–1023 / mobile <768) live in **`docs/web_app_conversion.md`**.

---

## 4. Acceptance criteria for Frontend (before QC)

- **AC-F1 (origin-agnostic client):** No hardcoded host/port/origin. REST via
  relative `/api/...`; socket via `${wss|ws}://${location.host}/ws` derived from
  `location`. App works unchanged at `https://bevane.loca.lt`.
- **AC-F2 (wss end-to-end):** Through the tunnel, the WS connects over `wss`,
  completes `auth → auth:ok`, and a chat message round-trips (send → echo + delivery,
  delivered/read receipts). Live presence + typing update.
- **AC-F3 (persistence on reload):** After a server restart **and** browser reload on
  both clients, the conversation, all messages (same order/content), the note, and the
  call log reappear via the REST endpoints; the socket reconnects and live chat
  resumes. (Backend side proven in §2 — Frontend must re-fetch on load / reconnect.)
- **AC-F4 (no iOS framing):** All §3 items removed/generalized; no zoom lock; manifest
  icons are canonical; layout no longer renders as a phone-shaped column on desktop.
- **AC-F5 (responsive layout):** Desktop = persistent sidebar + two-pane chat (list |
  thread); tablet reflows cleanly; mobile = single column + bottom tab bar — same DOM,
  CSS-driven (`docs/web_app_conversion.md` §b).
- **AC-F6 (accessibility):** Keyboard nav across all destinations + composer; visible
  `:focus-visible`; skip-link; landmarks (`banner`/`nav[aria-label="Primary"]`/`main`);
  one `h1` per view; state not by color alone; `aria-live` for incoming messages/calls
  (`docs/web_app_conversion.md` §c).
- **AC-F7 (no contract drift):** No expectation of any API change — `backend/api_specs.md`
  is frozen for v3.

---

## 5. References

- `backend/api_specs.md` — frozen REST + WS contract (code against verbatim).
- `backend/README.md` — tunnel/wss readiness + the persistence guarantee (this round's
  additions).
- `docs/web_app_conversion.md` — iOS-removal checklist, responsive layout, a11y,
  persistence acceptance test, delivery via `bevane.loca.lt`.
- `docs/business_requirements.md` §2 — v3 web-app framing.
- `tests/ws_smoke.js` — the real-time contract you ride over `wss`.

— Backend
