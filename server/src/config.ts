import { config as loadEnv } from 'dotenv';
import { z } from 'zod';

loadEnv();

const configSchema = z.object({
  port: z.coerce.number().default(8080),
  publicUrl: z.string().url().default('http://localhost:8080'),
  jellyfinBaseUrl: z.string().url(),
  jellyfinApiKey: z.string().min(1),
  allowOrigins: z
    .string()
    .default('*')
    .transform((value) =>
      value === '*' ? ['*'] : value.split(',').map((origin) => origin.trim()).filter(Boolean)
    ),
  trackerUrls: z
    .string()
    .optional()
    .transform((value) =>
      value ? value.split(',').map((url) => url.trim()).filter(Boolean) : []
    ),
  iceServers: z
    .string()
    .optional()
    .transform((value) => {
      if (!value) {
        return [];
      }
      try {
        const parsed = JSON.parse(value);
        return Array.isArray(parsed) ? parsed : [];
      } catch (error) {
        console.warn('Failed to parse ICE_SERVERS env value, expected JSON array');
        return [];
      }
    }),
  enableHlsProxy: z
    .string()
    .optional()
    .transform((value) => value === 'true' || value === '1')
});

export type AppConfig = z.infer<typeof configSchema>;

export const appConfig: AppConfig = configSchema.parse({
  port: process.env.PORT,
  publicUrl: process.env.PUBLIC_URL,
  jellyfinBaseUrl: process.env.JELLYFIN_BASE_URL,
  jellyfinApiKey: process.env.JELLYFIN_API_KEY,
  allowOrigins: process.env.ALLOW_ORIGINS,
  trackerUrls: process.env.TRACKER_URLS,
  iceServers: process.env.ICE_SERVERS,
  enableHlsProxy: process.env.ENABLE_HLS_PROXY
});
