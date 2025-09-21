import type Hls from 'hls.js';

export interface AppRuntimeConfig {
  publicUrl: string;
  trackerUrls: string[];
  iceServers: RTCIceServer[];
}

export interface P2pmlHlsjs {
  Engine: new (config: unknown) => {
    createLoaderClass(): typeof Hls.DefaultConfig.loader;
    destroy?(): void;
    getStats?(): {
      httpDownloaded?: number;
      p2pDownloaded?: number;
      peers?: unknown[];
    };
  };
  initHlsJsPlayer(hls: Hls): void;
}

declare global {
  interface Window {
    __APP_CONFIG__?: AppRuntimeConfig;
    p2pml?: {
      hlsjs: P2pmlHlsjs;
    };
  }
}

export {};
