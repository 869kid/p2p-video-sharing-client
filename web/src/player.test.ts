import type { Mock } from 'vitest';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('p2p-media-loader-hlsjs', () => ({}));

vi.mock('hls.js', () => {
  const instances: MockHlsInstance[] = [];

  class MockHls implements MockHlsInstance {
    static isSupported = vi.fn();
    static Events = { MEDIA_ATTACHED: 'MEDIA_ATTACHED' };
    static DefaultConfig = { loader: class {} };
    static instances = instances;

    public config: unknown;
    public attachMedia: Mock = vi.fn();
    public loadSource: Mock = vi.fn();
    public destroy: Mock = vi.fn();
    public on: Mock = vi.fn((event: string, callback: () => void) => {
      this.handlers.set(event, callback);
    });
    private handlers = new Map<string, () => void>();

    constructor(config?: unknown) {
      this.config = config;
      MockHls.instances.push(this);
    }

    emit(event: string) {
      this.handlers.get(event)?.();
    }
  }

  return {
    __esModule: true,
    default: MockHls
  };
});

import HlsModule from 'hls.js';
import { createPlayer } from './player';

type MockHlsInstance = {
  config: unknown;
  attachMedia: Mock;
  loadSource: Mock;
  destroy: Mock;
  on: Mock;
  emit(event: string): void;
};

type MockHlsStatic = {
  new (config?: unknown): MockHlsInstance;
  instances: MockHlsInstance[];
  isSupported: Mock;
  Events: { MEDIA_ATTACHED: string };
  DefaultConfig: { loader: unknown };
};

const HlsMock = HlsModule as unknown as MockHlsStatic;

describe('createPlayer', () => {
  beforeEach(() => {
    HlsMock.instances.length = 0;
    HlsMock.isSupported.mockReset();
    // Clear any previously attached mocks on video elements
    delete (window as Partial<typeof window>).p2pml;
  });

  afterEach(() => {
    delete (window as Partial<typeof window>).p2pml;
  });

  it('uses P2P engine when available and aggregates stats', () => {
    HlsMock.isSupported.mockReturnValue(true);

    const loaderClass = class {};
    const createLoaderClass = vi.fn(() => loaderClass);
    const destroyEngine = vi.fn();
    const getStats = vi.fn(() => ({ peers: ['peer-1', 'peer-2'] }));
    const engineInstance = {
      createLoaderClass,
      destroy: destroyEngine,
      getStats
    };
    const EngineMock = vi.fn(() => engineInstance);
    const initHlsJsPlayer = vi.fn();

    window.p2pml = {
      hlsjs: {
        Engine: EngineMock as unknown as new (config: unknown) => typeof engineInstance,
        initHlsJsPlayer
      }
    };

    const video = document.createElement('video');
    video.play = vi.fn().mockResolvedValue(undefined);

    const controller = createPlayer({
      video,
      m3u8Url: 'https://cdn.example.com/video.m3u8',
      swarmId: 'swarm-1',
      autoPlay: true,
      trackers: ['tracker-1'],
      rtcConfig: { iceServers: [] }
    });

    expect(EngineMock).toHaveBeenCalledWith({
      segments: { swarmId: 'swarm-1' },
      loader: {
        rtcConfig: { iceServers: [] },
        trackerAnnounce: ['tracker-1']
      }
    });

    const hlsInstance = HlsMock.instances[0];
    expect(hlsInstance.config).toEqual({ loader: loaderClass });
    expect(initHlsJsPlayer).toHaveBeenCalledWith(hlsInstance);
    expect(hlsInstance.attachMedia).toHaveBeenCalledWith(video);

    expect(video.play).not.toHaveBeenCalled();
    hlsInstance.emit(HlsMock.Events.MEDIA_ATTACHED);
    expect(hlsInstance.loadSource).toHaveBeenCalledWith('https://cdn.example.com/video.m3u8');
    expect(video.play).toHaveBeenCalledTimes(1);

    expect(controller.hls).toBe(hlsInstance);
    expect(controller.engine).toBe(engineInstance);
    expect(controller.getStats()).toEqual({ httpDownloaded: 0, p2pDownloaded: 0, peers: 2 });

    controller.destroy();
    expect(hlsInstance.destroy).toHaveBeenCalled();
    expect(destroyEngine).toHaveBeenCalled();
  });

  it('creates plain HLS player when P2P engine is not available', () => {
    HlsMock.isSupported.mockReturnValue(true);

    const video = document.createElement('video');
    video.play = vi.fn().mockResolvedValue(undefined);

    const controller = createPlayer({
      video,
      m3u8Url: 'https://cdn.example.com/plain.m3u8',
      swarmId: 'swarm-2',
      autoPlay: false
    });

    const hlsInstance = HlsMock.instances[0];
    expect(controller.engine).toBeNull();
    expect(controller.hls).toBe(hlsInstance);
    expect(hlsInstance.config).toBeUndefined();

    hlsInstance.emit(HlsMock.Events.MEDIA_ATTACHED);
    expect(hlsInstance.loadSource).toHaveBeenCalledWith('https://cdn.example.com/plain.m3u8');
    expect(video.play).not.toHaveBeenCalled();
    expect(controller.getStats()).toEqual({ httpDownloaded: 0, p2pDownloaded: 0, peers: 0 });

    controller.destroy();
    expect(hlsInstance.destroy).toHaveBeenCalled();
  });

  it('falls back to native playback when HLS is not supported', () => {
    HlsMock.isSupported.mockReturnValue(false);

    const video = document.createElement('video');
    video.play = vi.fn().mockResolvedValue(undefined);

    const controller = createPlayer({
      video,
      m3u8Url: 'https://cdn.example.com/fallback.m3u8',
      swarmId: 'swarm-3',
      autoPlay: true
    });

    expect(HlsMock.instances).toHaveLength(0);
    expect(video.getAttribute('src')).toBe('https://cdn.example.com/fallback.m3u8');
    expect(video.play).toHaveBeenCalledTimes(1);
    expect(controller.hls).toBeNull();
    expect(controller.engine).toBeNull();
    expect(controller.getStats()).toBeNull();

    controller.destroy();
    expect(video.getAttribute('src')).toBeNull();
  });
});
