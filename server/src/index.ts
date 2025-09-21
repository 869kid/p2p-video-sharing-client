import path from 'node:path';
import http from 'node:http';
import express from 'express';
import cors from 'cors';
import { WebSocketServer } from 'ws';
import { appConfig } from './config';
import { getPlaybackInfo } from './jellyfin';
import { registerProxy } from './proxy';
import { rooms, type RoomInboundMessage } from './rooms';

const app = express();

const allowOrigins = appConfig.allowOrigins.includes('*')
  ? '*'
  : (appConfig.allowOrigins as string[]);

app.set('trust proxy', true);
app.use(express.json());
app.use(
  cors({
    origin: allowOrigins,
    credentials: false
  })
);

app.get('/api/health', (_req, res) => {
  res.json({ ok: true });
});

app.get('/api/config', (_req, res) => {
  res.json({
    publicUrl: appConfig.publicUrl,
    trackerUrls: appConfig.trackerUrls ?? [],
    iceServers: appConfig.iceServers ?? []
  });
});

app.get('/api/playback-info', async (req, res) => {
  const itemId = req.query.itemId as string | undefined;
  if (!itemId) {
    res.status(400).json({ error: 'itemId is required' });
    return;
  }

  try {
    const info = await getPlaybackInfo(itemId, appConfig);
    res.json(info);
  } catch (error) {
    console.error('Failed to retrieve playback info', error);
    res.status(500).json({ error: 'Failed to retrieve playback info' });
  }
});

app.get('/api/sign-m3u8', (req, res) => {
  const m3u8 = req.query.m3u8 as string | undefined;
  if (!m3u8) {
    res.status(400).json({ error: 'm3u8 is required' });
    return;
  }

  try {
    const target = new URL(m3u8);
    const base = new URL(appConfig.jellyfinBaseUrl);
    if (target.host !== base.host) {
      res.status(400).json({ error: 'URL must point to configured Jellyfin origin' });
      return;
    }
    if (!target.searchParams.has('api_key')) {
      target.searchParams.set('api_key', appConfig.jellyfinApiKey);
    }
    res.json({ m3u8Url: target.toString() });
  } catch (error) {
    res.status(400).json({ error: 'Invalid URL' });
  }
});

registerProxy(app, appConfig);

const distDir = path.resolve(__dirname, '../../web/dist');
app.use(express.static(distDir));
app.get('*', (req, res, next) => {
  if (req.path.startsWith('/api') || req.path.startsWith('/ws')) {
    next();
    return;
  }
  res.sendFile(path.join(distDir, 'index.html'), (err) => {
    if (err) {
      next(err);
    }
  });
});

const server = http.createServer(app);
const wss = new WebSocketServer({ server, path: '/ws' });

wss.on('connection', (socket) => {
  let roomId: string | null = null;

  socket.on('message', (data) => {
    try {
      const parsed = JSON.parse(data.toString()) as RoomInboundMessage;
      if (parsed.type === 'join') {
        roomId = parsed.roomId;
        rooms.join(parsed.roomId, socket, parsed.userName);
      } else if (parsed.type === 'control' && roomId) {
        rooms.handleControl(roomId, parsed.action, parsed.time);
      }
    } catch (error) {
      console.warn('Received invalid WS message', error);
    }
  });
});

server.listen(appConfig.port, () => {
  console.log(`Server listening on port ${appConfig.port}`);
});
