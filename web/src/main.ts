import './style.css';
import type { AppRuntimeConfig } from './global';
import { AppUi } from './ui';

const appEl = document.querySelector<HTMLDivElement>('#app');
if (!appEl) {
  throw new Error('Missing #app container');
}

appEl.innerHTML = `
  <main style="padding: 1.5rem; max-width: 960px; margin: 0 auto;">
    <header style="margin-bottom: 1rem;">
      <h1 style="margin: 0 0 0.5rem;">Jellyfin P2P Watch</h1>
      <p style="margin: 0; color: #cbd5f5;">
        Connect to Jellyfin, join a room, and share bandwidth with peers.
      </p>
    </header>
    <section style="display: grid; grid-template-columns: 1fr 1fr; gap: 1rem; align-items: start;">
      <form id="join-form" style="display: flex; flex-direction: column; gap: 0.75rem;">
        <label style="display: flex; flex-direction: column; gap: 0.25rem;">
          <span>Jellyfin itemId</span>
          <input name="itemId" placeholder="e.g. 123abc" />
        </label>
        <label style="display: flex; flex-direction: column; gap: 0.25rem;">
          <span>Direct M3U8 URL (optional)</span>
          <input name="m3u8" placeholder="Overrides itemId when provided" />
        </label>
        <label style="display: flex; flex-direction: column; gap: 0.25rem;">
          <span>Room ID</span>
          <input name="roomId" required placeholder="watch-party" />
        </label>
        <label style="display: flex; flex-direction: column; gap: 0.25rem;">
          <span>Display name</span>
          <input name="displayName" required placeholder="Alice" />
        </label>
        <button type="submit" style="padding: 0.5rem; font-weight: 600;">Join room</button>
        <p id="status" style="margin: 0; color: #cbd5f5;">Waiting to join…</p>
        <p id="stats" style="margin: 0; font-size: 0.85rem; color: #a3bffa;"></p>
        <p id="users" style="margin: 0; font-size: 0.85rem; color: #a3bffa;"></p>
      </form>
      <div style="display: flex; flex-direction: column; gap: 0.5rem;">
        <video id="player" controls playsinline style="width: 100%; background: #000; min-height: 280px;"></video>
        <div style="display: flex; gap: 0.5rem;">
          <button id="play">Play</button>
          <button id="pause">Pause</button>
          <input id="seek-time" type="number" min="0" step="1" placeholder="Seek seconds" style="flex: 1;" />
          <button id="seek">Seek</button>
        </div>
      </div>
    </section>
  </main>
`;

void bootstrap();

async function bootstrap() {
  const config = await loadRuntimeConfig();
  const apiBase = config?.publicUrl || `${window.location.protocol}//${window.location.host}`;

  const form = document.querySelector<HTMLFormElement>('#join-form');
  const video = document.querySelector<HTMLVideoElement>('#player');
  const statusEl = document.querySelector<HTMLElement>('#status');
  const statsEl = document.querySelector<HTMLElement>('#stats');
  const usersEl = document.querySelector<HTMLElement>('#users');
  const playButton = document.querySelector<HTMLButtonElement>('#play');
  const pauseButton = document.querySelector<HTMLButtonElement>('#pause');
  const seekButton = document.querySelector<HTMLButtonElement>('#seek');
  const seekInput = document.querySelector<HTMLInputElement>('#seek-time');

  if (!form || !video || !statusEl || !statsEl || !usersEl || !playButton || !pauseButton || !seekButton || !seekInput) {
    throw new Error('UI failed to initialize');
  }

  const ui = new AppUi(
    {
      apiBaseUrl: apiBase,
      trackers: config?.trackerUrls ?? [],
      iceServers: config?.iceServers ?? []
    },
    {
      form,
      video,
      statusEl,
      statsEl,
      usersEl,
      playButton,
      pauseButton,
      seekButton,
      seekInput
    }
  );

  prefillFromQuery(form);
  ui.init();
}

async function loadRuntimeConfig(): Promise<AppRuntimeConfig | undefined> {
  if (window.__APP_CONFIG__) {
    return window.__APP_CONFIG__;
  }
  try {
    const response = await fetch('/api/config');
    if (!response.ok) {
      return undefined;
    }
    const data = (await response.json()) as AppRuntimeConfig;
    window.__APP_CONFIG__ = data;
    return data;
  } catch (error) {
    console.warn('Failed to load runtime config', error);
    return undefined;
  }
}

function prefillFromQuery(formEl: HTMLFormElement) {
  const params = new URLSearchParams(window.location.search);
  const itemId = params.get('itemId') || '';
  const m3u8 = params.get('m3u8') || '';
  const roomId = params.get('roomId') || '';
  const displayName = params.get('name') || '';

  (formEl.elements.namedItem('itemId') as HTMLInputElement).value = itemId;
  (formEl.elements.namedItem('m3u8') as HTMLInputElement).value = m3u8;
  (formEl.elements.namedItem('roomId') as HTMLInputElement).value = roomId;
  (formEl.elements.namedItem('displayName') as HTMLInputElement).value = displayName;
}
