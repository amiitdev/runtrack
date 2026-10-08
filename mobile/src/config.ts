/**
 * Single source of truth for where the API lives.
 *
 * EXPO_PUBLIC_* variables are inlined by Metro at build time — they are
 * public by design (the phone must know the URL), never put secrets here.
 *
 *   .env  ->  EXPO_PUBLIC_API_URL=http://192.168.x.x:4000
 */
export const API_URL: string =
  process.env.EXPO_PUBLIC_API_URL ?? 'http://localhost:4000';

/**
 * Your phone's timezone, used for every "today / this week / streak" number.
 * Falling back to UTC would shift the day boundary on the server.
 */
export const APP_TZ: string =
  Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
