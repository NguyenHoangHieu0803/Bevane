# Bevane

A private peer-to-peer communication app — messaging, voice/video calling, and AI-assisted notes — delivered as a **Progressive Web App (PWA)**. iOS users scan a QR code, open it in Safari, and can install it to the Home Screen. Built by an AI Agent Team (Business Analyst → Backend → Frontend → QA/QC).

## Features

- **Messaging** — real-time chat via WebSocket with typing indicators, delivery/read receipts, and message reactions
- **Voice calling** — WebRTC audio call with invite/accept/decline flow
- **Video calling** — WebRTC video with local self-preview and remote stream
- **Notes** — full CRUD notes with offline AI suggestions (no external API)

## Platforms & Services

| Platform | Role |
|----------|------|
| [Render.com](https://render.com) | Production hosting — auto-deploys from `main` |
| [GitHub](https://github.com/NguyenHoangHieu0803/Bevane) | Source code & CI/CD trigger for Render |
| [GitHub Codespaces](https://github.com/features/codespaces) | Cloud development environment |
| localtunnel (`bevane.loca.lt`) | Dev HTTPS tunnel (not needed in production) |
| Google STUN (`stun.l.google.com:19302`) | WebRTC NAT traversal for calls |
| Node.js built-in `node:sqlite` | Embedded SQLite — no separate database server |

No external AI API, no auth provider, no push notification service, no CDN.

## Quick Start

```bash
npm install
node server.js        # server on port 3000
```

See [Guideline.md](Guideline.md) for full setup, Render deployment, localtunnel, and testing instructions.

## Built With

- Node.js 24 + Express + `ws` (WebSocket)
- Vanilla ES modules — no frontend build step
- SQLite via `node:sqlite` (Node.js built-in)
- WebRTC (STUN-only, peer-to-peer media)
- Service Worker + Web App Manifest (PWA / offline shell)

## Agents

| Agent | Output |
|-------|--------|
| Business Analyst | Requirements, user stories, data model |
| Backend Developer | Express + WebSocket + SQLite + offline AI |
| Frontend Developer | Mobile-first PWA, WebRTC, service worker |
| QA/QC Full-Stack | Test plan, smoke tests, quality gate |