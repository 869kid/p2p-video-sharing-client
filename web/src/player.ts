import Hls from 'hls.js';
import 'p2p-media-loader-hlsjs';
import type { P2pmlHlsjs } from './global';

export interface PlayerOptions {
  video: HTMLVideoElement;
  m3u8Url: string;
  swarmId: string;
  autoPlay?: boolean;
  trackers?: string[];
  rtcConfig?: RTCConfiguration;
}

interface LoaderEngine {
  createLoaderClass(): typeof Hls.DefaultConfig.loader;
  destroy?(): void;
  getStats?(): {
    httpDownloaded?: number;
    p2pDownloaded?: number;
    peers?: unknown[];
  };
}

export interface PlayerController {
  hls: Hls | null;
  engine: LoaderEngine | null;
  destroy(): void;
  getStats(): { httpDownloaded: number; p2pDownloaded: number; peers: number } | null;
}

export function createPlayer(options: PlayerOptions): PlayerController {
  const { video, m3u8Url, swarmId, autoPlay, trackers, rtcConfig } = options;

  const p2pml = window.p2pml?.hlsjs as P2pmlHlsjs | undefined;

  if (Hls.isSupported() && p2pml) {
    const engine = new p2pml.Engine({
      segments: {
        swarmId
      },
      loader: {
        rtcConfig,
        trackerAnnounce: trackers
      }
    });

    const hls = new Hls({
      loader: engine.createLoaderClass()
    });

    p2pml.initHlsJsPlayer(hls);
    hls.attachMedia(video);
    hls.on(Hls.Events.MEDIA_ATTACHED, () => {
      hls.loadSource(m3u8Url);
      if (autoPlay) {
        video.play().catch(() => undefined);
      }
    });

    return {
      hls,
      engine,
      destroy() {
        hls.destroy();
        engine.destroy?.();
      },
      getStats() {
        if (typeof engine.getStats !== 'function') {
          return null;
        }
        const stats = engine.getStats();
        return {
          httpDownloaded: stats?.httpDownloaded ?? 0,
          p2pDownloaded: stats?.p2pDownloaded ?? 0,
          peers: stats?.peers ? stats.peers.length : 0
        };
      }
    };
  }

  if (Hls.isSupported()) {
    const hls = new Hls();
    hls.attachMedia(video);
    hls.on(Hls.Events.MEDIA_ATTACHED, () => {
      hls.loadSource(m3u8Url);
      if (autoPlay) {
        video.play().catch(() => undefined);
      }
    });

    return {
      hls,
      engine: null,
      destroy() {
        hls.destroy();
      },
      getStats() {
        return {
          httpDownloaded: 0,
          p2pDownloaded: 0,
          peers: 0
        };
      }
    };
  }

  // Safari fallback - rely on native HLS
  video.src = m3u8Url;
  if (autoPlay) {
    video.play().catch(() => undefined);
  }

  return {
    hls: null,
    engine: null,
    destroy() {
      video.removeAttribute('src');
    },
    getStats() {
      return null;
    }
  };
}
