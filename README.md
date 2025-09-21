# Jellyfin P2P Watch

> Thin web client + Node backend that plays Jellyfin HLS/DASH while sharing segments across peers via WebRTC.

```
Jellyfin (origin) ──▶ Jellyfin P2P Watch server ──▶ Browser client with Hls.js + p2p-media-loader
                                   ▲                                  ▲
                                   └───────────── WebRTC mesh ◀───────┘
```

## Features

- Fetches playback info and manifests from an existing Jellyfin instance (no fork).
- Thin Express backend with WebSocket room coordination (SyncPlay-like controls).
- Browser player powered by Hls.js and `p2p-media-loader-hlsjs` to exchange segments via WebRTC.
- In-memory room state (play, pause, seek) with presence broadcast.
- Minimal UI for joining rooms, sending playback controls, and viewing P2P stats.
- Configurable trackers and ICE servers for WebRTC connectivity.

## Getting started

1. Copy `.env.example` to `.env` and fill in your Jellyfin details:
   ```env
   PORT=8080
   PUBLIC_URL=http://localhost:8080
   JELLYFIN_BASE_URL=https://jellyfin.example.com
   JELLYFIN_API_KEY=your-api-key
   ALLOW_ORIGINS=http://localhost:5173,http://localhost:8080
   TRACKER_URLS=wss://tracker.openwebtorrent.com
   ICE_SERVERS=[{"urls":"stun:stun.l.google.com:19302"}]
   ENABLE_HLS_PROXY=false
   ```
2. Install dependencies with npm (Node 18+ recommended):
   ```bash
   npm install
   ```
3. Launch the dev environment (Vite + Nodemon):
   ```bash
   npm run dev
   ```
4. Open the app:
   - Development: <http://localhost:5173>
   - Or directly on the backend (serving built assets): <http://localhost:8080>
5. Join a room via query params: `http://localhost:8080/?itemId=<ITEM_ID>&roomId=test&name=Alice`

### Direct manifest mode

If you already have a signed HLS manifest, pass it via `?m3u8=...` or fill it in the form. The backend can optionally re-sign/validate via `/api/sign-m3u8`.

## Architecture

- **Backend (`/server`)**
  - `src/index.ts` — Express app + WebSocket server, serves API + static assets.
  - `src/rooms.ts` — In-memory room manager for SyncPlay-like control.
  - `src/jellyfin.ts` — Helper to call Jellyfin's PlaybackInfo endpoint and derive an HLS URL.
  - `src/proxy.ts` — Optional `/proxy/hls/*` endpoint that forwards requests to Jellyfin adding auth headers.
  - `src/config.ts` — Environment variable parsing (`PORT`, `JELLYFIN_*`, `TRACKER_URLS`, etc.).

- **Frontend (`/web`)**
  - Vite + TypeScript.
  - `src/player.ts` — Hls.js + `p2p-media-loader` integration.
  - `src/sync.ts` — WebSocket client for room presence and control state.
  - `src/ui.ts` — Form handling, playback controls, simple stats display.
  - `src/main.ts` — Bootstraps the UI and loads runtime config.

- **Scripts**
  - `scripts/dev.sh` — helper to start dev mode.
  - `scripts/build.sh` — helper to build the project.

## Building & running

```bash
npm run build       # Builds web (Vite) then server (tsc)
npm run start --prefix server  # Run compiled server serving static assets
```

The Express server serves `web/dist` in production. Ensure you run `npm run build` before starting the backend.

## SyncPlay-like control flow

- Clients connect to `/ws` and send `{ type: "join", roomId, userName }`.
- Play/Pause/Seek buttons dispatch `{ type: "control", action, time }`.
- Server broadcasts presence lists and the latest playback state (`{ type: "state", action, time, updatedAt }`).

## P2P media loader configuration

- Trackers are provided via `TRACKER_URLS` (comma-separated) and exposed to the browser via `/api/config`.
- ICE servers are provided via `ICE_SERVERS` (JSON array). Example for TURN:
  ```env
  ICE_SERVERS=[{"urls":"turn:turn.example.com:3478","username":"user","credential":"pass"}]
  ```
- Modify `rtcConfig` in `web/src/player.ts` if you need advanced WebRTC settings.

## Production deployment notes

- Build the project and serve with the Node backend behind a reverse proxy (HTTPS strongly recommended).
- Example nginx configuration snippet:
  ```nginx
  server {
    listen 443 ssl;
    server_name watch.example.com;

    location / {
      proxy_pass http://127.0.0.1:8080;
      proxy_set_header Host $host;
      proxy_set_header X-Forwarded-Proto https;
      proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
      proxy_http_version 1.1;
      proxy_set_header Upgrade $http_upgrade;
      proxy_set_header Connection $connection_upgrade;
    }
  }
  ```
- Set `PUBLIC_URL` to the externally reachable HTTPS URL so the frontend can compute correct WebSocket endpoints.
- If running behind CGNAT, configure TURN servers so peers can connect.

## Limitations & TODOs

- In-memory rooms only — persistence would be needed for multi-process setups (see `rooms.ts`).
- Playback info derivation is naive; consider handling transcoding profiles and audio/subtitle selection.
- No Jellyfin user auth flow; supply API keys via environment variables or extend the backend for user tokens.
- No DRM or secure playback enforcement.
- TURN servers may be required for strict networks.
- Additional validation and logging recommended for production hardening.
