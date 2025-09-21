import { afterEach, describe, expect, it, vi } from 'vitest';

import type { AppConfig } from './config';
import { getPlaybackInfo } from './jellyfin';

const baseConfig: AppConfig = {
  port: 8080,
  publicUrl: 'https://example.com',
  jellyfinBaseUrl: 'https://media.example.com',
  jellyfinApiKey: 'secret-token',
  allowOrigins: ['*'],
  trackerUrls: [],
  iceServers: [],
  enableHlsProxy: false
};

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('getPlaybackInfo', () => {
  it('requests playback info with correct parameters and headers', async () => {
    const directUrl = 'https://media.example.com/stream.m3u8';
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        MediaSources: [
          {
            DirectStreamUrl: directUrl
          }
        ],
        NowPlayingItem: {
          Name: 'Example Item',
          RunTimeTicks: 120 * 10_000_000
        }
      })
    });

    vi.stubGlobal('fetch', fetchMock);

    const result = await getPlaybackInfo('item-123', baseConfig);

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0];
    const requestUrl = new URL(url as string);
    expect(requestUrl.pathname).toBe('/Items/item-123/PlaybackInfo');
    expect(requestUrl.searchParams.get('EnableHlsStreaming')).toBe('true');
    expect(requestUrl.searchParams.get('AutoOpenLiveStream')).toBe('false');

    expect(init?.method).toBe('POST');
    expect(init?.headers).toMatchObject({
      'Content-Type': 'application/json',
      'X-Emby-Token': baseConfig.jellyfinApiKey,
      'X-MediaBrowser-Token': baseConfig.jellyfinApiKey
    });
    expect(init?.body).toBe(JSON.stringify({}));

    expect(result.m3u8Url).toBe(`${directUrl}?api_key=${baseConfig.jellyfinApiKey}`);
    expect(result.title).toBe('Example Item');
    expect(result.duration).toBe(120);
  });

  it('falls back to master manifest when direct stream is unavailable', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        MediaSources: [{}],
        Name: 'Fallback Item',
        RunTimeTicks: 30 * 10_000_000
      })
    });

    vi.stubGlobal('fetch', fetchMock);

    const result = await getPlaybackInfo('abc 123', baseConfig);

    expect(result.m3u8Url).toBe(
      'https://media.example.com/Videos/abc%20123/master.m3u8?api_key=secret-token'
    );
    expect(result.title).toBe('Fallback Item');
    expect(result.duration).toBe(30);
  });

  it('preserves existing tokens and returns undefined duration when ticks absent', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        MediaSources: [
          {
            DirectStreamUrl: 'https://media.example.com/stream.m3u8?api_key=existing'
          }
        ]
      })
    });

    vi.stubGlobal('fetch', fetchMock);

    const result = await getPlaybackInfo('item-456', baseConfig);

    expect(result.m3u8Url).toBe('https://media.example.com/stream.m3u8?api_key=existing');
    expect(result.duration).toBeUndefined();
  });

  it('throws an error when the response is not ok and includes response text', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: false,
      status: 500,
      text: async () => 'boom'
    });

    vi.stubGlobal('fetch', fetchMock);

    await expect(getPlaybackInfo('broken', baseConfig)).rejects.toThrow(
      'Failed to fetch playback info (500): boom'
    );
  });
});
