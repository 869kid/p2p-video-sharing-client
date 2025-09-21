import type { AppConfig } from './config';

export interface PlaybackInfo {
  m3u8Url: string;
  title: string;
  duration?: number;
}

interface JellyfinPlaybackInfoResponse {
  MediaSources?: Array<{
    Id?: string;
    Path?: string;
    DirectStreamUrl?: string;
    MediaStreams?: Array<{ DisplayTitle?: string }>;
    Container?: string;
  }>;
  MediaSourceId?: string;
  NowPlayingItem?: {
    Name?: string;
    RunTimeTicks?: number;
  };
  Name?: string;
  RunTimeTicks?: number;
}

const TICKS_IN_SECOND = 10_000_000;

export async function getPlaybackInfo(
  itemId: string,
  config: AppConfig
): Promise<PlaybackInfo> {
  const url = new URL(`/Items/${encodeURIComponent(itemId)}/PlaybackInfo`, config.jellyfinBaseUrl);
  url.searchParams.set('EnableHlsStreaming', 'true');
  url.searchParams.set('AutoOpenLiveStream', 'false');

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Emby-Token': config.jellyfinApiKey,
      'X-MediaBrowser-Token': config.jellyfinApiKey
    },
    body: JSON.stringify({})
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Failed to fetch playback info (${response.status}): ${text}`);
  }

  const data = (await response.json()) as JellyfinPlaybackInfoResponse;
  const source = data.MediaSources?.[0];

  const manifestFromApi = source?.DirectStreamUrl || source?.Path;
  const fallbackManifest = new URL(
    `/Videos/${encodeURIComponent(itemId)}/master.m3u8`,
    config.jellyfinBaseUrl
  ).toString();
  const manifestUrl = manifestFromApi || fallbackManifest;

  const title = data.NowPlayingItem?.Name || data.Name || `Item ${itemId}`;
  const durationTicks = data.NowPlayingItem?.RunTimeTicks ?? data.RunTimeTicks;
  const duration = durationTicks ? durationTicks / TICKS_IN_SECOND : undefined;

  const urlWithToken = appendToken(manifestUrl, config.jellyfinApiKey);

  return {
    m3u8Url: urlWithToken,
    title,
    duration
  };
}

function appendToken(manifestUrl: string, token: string) {
  try {
    const url = new URL(manifestUrl);
    if (!url.searchParams.has('api_key')) {
      url.searchParams.set('api_key', token);
    }
    return url.toString();
  } catch (error) {
    // manifest may already be absolute with token
    return manifestUrl;
  }
}
