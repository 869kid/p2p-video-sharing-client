import { createPlayer, type PlayerController } from './player';
import { connectSync, type SyncConnection } from './sync';

interface JoinFormValues {
  itemId: string;
  m3u8: string;
  roomId: string;
  displayName: string;
}

interface AppDependencies {
  apiBaseUrl: string;
  trackers: string[];
  iceServers: RTCIceServer[];
}

interface UiContext {
  video: HTMLVideoElement;
  statusEl: HTMLElement;
  statsEl: HTMLElement;
  usersEl: HTMLElement;
  playButton: HTMLButtonElement;
  pauseButton: HTMLButtonElement;
  seekButton: HTMLButtonElement;
  seekInput: HTMLInputElement;
  form: HTMLFormElement;
}

export class AppUi {
  private player: PlayerController | null = null;
  private sync: SyncConnection | null = null;
  private statsInterval: number | null = null;

  constructor(private readonly deps: AppDependencies, private readonly ctx: UiContext) {}

  init() {
    this.ctx.form.addEventListener('submit', (event) => {
      event.preventDefault();
      const values = this.getFormValues();
      this.join(values).catch((error) => {
        console.error(error);
        this.setStatus(`Failed to start playback: ${String(error)}`);
      });
    });

    this.ctx.playButton.addEventListener('click', () => {
      if (!this.player || !this.sync) {
        return;
      }
      this.ctx.video.play().catch(() => undefined);
      const time = this.ctx.video.currentTime;
      this.sync.sendControl({ action: 'play', time });
    });

    this.ctx.pauseButton.addEventListener('click', () => {
      if (!this.player || !this.sync) {
        return;
      }
      this.ctx.video.pause();
      const time = this.ctx.video.currentTime;
      this.sync.sendControl({ action: 'pause', time });
    });

    this.ctx.seekButton.addEventListener('click', () => {
      if (!this.player || !this.sync) {
        return;
      }
      const target = Number.parseFloat(this.ctx.seekInput.value || '0');
      if (!Number.isFinite(target)) {
        return;
      }
      this.ctx.video.currentTime = target;
      this.sync.sendControl({ action: 'seek', time: target });
    });
  }

  private async join(values: JoinFormValues) {
    const { itemId, m3u8, roomId, displayName } = values;
    if (!roomId || !displayName) {
      throw new Error('Room ID and display name are required');
    }

    const playback = m3u8 ? { m3u8Url: m3u8 } : await this.fetchPlayback(itemId);
    const swarmId = `${itemId || playback.m3u8Url}:${'auto'}:${'auto'}`;

    if (this.player) {
      this.player.destroy();
    }
    if (this.sync) {
      this.sync.close();
    }
    if (this.statsInterval) {
      window.clearInterval(this.statsInterval);
      this.statsInterval = null;
    }

    const trackers = this.deps.trackers.length > 0 ? this.deps.trackers : undefined;

    this.player = createPlayer({
      video: this.ctx.video,
      m3u8Url: playback.m3u8Url,
      swarmId,
      autoPlay: true,
      trackers,
      rtcConfig: {
        iceServers: this.deps.iceServers
      }
    });

    this.sync = connectSync(this.deps.apiBaseUrl, { roomId, userName: displayName });
    this.sync.onState((state) => {
      this.applyRemoteState(state.action, state.time);
    });
    this.sync.onPresence((users) => {
      this.ctx.usersEl.textContent = users.join(', ') || 'Waiting for peers';
    });

    this.setStatus(`Joined room ${roomId}`);

    const updateStats = () => {
      if (!this.player) {
        return;
      }
      const stats = this.player.getStats();
      if (!stats) {
        this.ctx.statsEl.textContent = 'P2P stats not available';
        return;
      }
      this.ctx.statsEl.textContent = `HTTP: ${(stats.httpDownloaded / 1024).toFixed(1)} KB | P2P: ${(stats.p2pDownloaded / 1024).toFixed(1)} KB | Peers: ${stats.peers}`;
    };

    updateStats();
    this.statsInterval = window.setInterval(updateStats, 2_000);
  }

  private async fetchPlayback(itemId: string) {
    if (!itemId) {
      throw new Error('itemId is required when no m3u8 URL is provided');
    }
    const response = await fetch(`${this.deps.apiBaseUrl}/api/playback-info?itemId=${encodeURIComponent(itemId)}`);
    if (!response.ok) {
      throw new Error('Failed to fetch playback info');
    }
    return (await response.json()) as { m3u8Url: string };
  }

  private getFormValues(): JoinFormValues {
    const formData = new FormData(this.ctx.form);
    return {
      itemId: (formData.get('itemId') as string) || '',
      m3u8: (formData.get('m3u8') as string) || '',
      roomId: (formData.get('roomId') as string) || '',
      displayName: (formData.get('displayName') as string) || ''
    };
  }

  private applyRemoteState(action: string, time: number) {
    if (!this.player) {
      return;
    }
    if (Math.abs(this.ctx.video.currentTime - time) > 0.5) {
      this.ctx.video.currentTime = time;
    }
    if (action === 'play') {
      this.ctx.video.play().catch(() => undefined);
    } else if (action === 'pause') {
      this.ctx.video.pause();
    } else if (action === 'seek') {
      // Seek already applied via currentTime adjustment
    }
  }

  private setStatus(message: string) {
    this.ctx.statusEl.textContent = message;
  }
}
