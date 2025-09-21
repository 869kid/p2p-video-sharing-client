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
   ALLOW_ORIGINS=http://localhost:8080
   TRACKER_URLS=wss://tracker.openwebtorrent.com
   ICE_SERVERS=[{"urls":"stun:stun.l.google.com:19302"}]
   ENABLE_HLS_PROXY=false
   ```
2. Build and start the stack with Docker Compose (the helper script `./scripts/dev.sh` wraps the same command):
   ```bash
   docker compose up --build
   ```
   - Override the published port with `APP_PORT=9000 docker compose up --build` if you need a different host port.
   - Use `-d` to start the container in the background and `docker compose down` to stop it.
3. Open the app: <http://localhost:8080> (or the host port you mapped via `APP_PORT`).
4. Join a room via query params: `http://localhost:8080/?itemId=<ITEM_ID>&roomId=test&name=Alice`

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
  - `scripts/dev.sh` — wrapper around `docker compose up --build` for local runs.
  - `scripts/build.sh` — wrapper around `docker compose build` (defaults to the `app` service).

## Building & running

The multi-stage Dockerfile builds the frontend and backend automatically. Use Docker Compose to produce and run the container image:

```bash
./scripts/build.sh         # docker compose build app
docker compose up -d app   # Start the stack in the background
docker compose logs -f app # Follow logs
docker compose down        # Stop and clean up containers and networks
```

For one-off commands inside the container you can use `docker compose run --rm app <command>`.

## Docker Compose / DockerPult deployment

The repository includes a multi-stage Dockerfile and a matching `docker-compose.yml`. The same definition works for local
development, staging, or DockerPult-based production rollouts.

1. Copy `.env.example` to `.env` and populate your Jellyfin connection and tracker details. The file is consumed via the
   Compose `env_file` setting.
2. Build or pull the image referenced by the Compose file:
   ```bash
   docker compose build app      # local build
   docker compose pull app       # pull from a registry (e.g., DockerPult/CI pipeline)
   ```
3. Start or update the stack:
   ```bash
   docker compose up -d app
   docker compose ps
   ```
4. Tail logs or restart the service when needed:
   ```bash
   docker compose logs -f app
   docker compose restart app
   ```

Set `APP_PORT` before running Compose if you need a different host port: `APP_PORT=9000 docker compose up -d app`. The
container listens on `$PORT` (default `8080`) and serves the compiled static frontend alongside the Node.js backend built
inside the image.

## CI/CD automation

The `deploy` GitHub Actions workflow publishes the Docker image to GHCR when the `CI` workflow finishes on `main` or when tags
matching `v*` are pushed. It reuses the multi-stage Dockerfile and updates remote hosts over SSH when the necessary secrets
are available.

### Required secrets

Configure the following repository secrets so the workflow can publish images and trigger remote deployments:

- `SSH_HOST` — SSH hostname or IP address of the deployment target.
- `SSH_USER` — SSH user with permissions to pull the repository and manage Docker.
- `SSH_KEY` — Private key matching the authorized deploy key on the target host.
- `DEPLOY_PATH` — Absolute path to the Git repository on the remote server.
- `GHCR_TOKEN` — Personal access token or fine-grained token with `packages:read` access for `ghcr.io`.

### Image tag format

Every build pushed by the workflow includes the following tags so you can choose the appropriate image reference in Docker
Compose or other tooling:

- `sha-<full commit SHA>` — immutable reference for the exact commit that triggered the build.
- `latest` — convenience tag published for the `main` branch and `v*` release tags.
- `<branch-or-tag>` — sanitized branch name (e.g., `main`) for branch builds or the Git tag name (e.g., `v1.2.3`).

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

- Run the container behind a reverse proxy (HTTPS strongly recommended).
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
