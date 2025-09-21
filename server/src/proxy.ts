import type { Express } from 'express';
import { createProxyMiddleware } from 'http-proxy-middleware';
import type { AppConfig } from './config';

export function registerProxy(app: Express, config: AppConfig) {
  if (!config.enableHlsProxy) {
    return;
  }

  const target = config.jellyfinBaseUrl;

  app.use(
    '/proxy/hls',
    createProxyMiddleware({
      target,
      changeOrigin: true,
      ws: false,
      pathRewrite: {
        '^/proxy/hls': ''
      },
      onProxyReq: (proxyReq) => {
        proxyReq.setHeader('X-Emby-Token', config.jellyfinApiKey);
        proxyReq.setHeader('X-MediaBrowser-Token', config.jellyfinApiKey);
      },
      onProxyRes: (proxyRes) => {
        proxyRes.headers['access-control-allow-origin'] = '*';
      }
    })
  );
}
