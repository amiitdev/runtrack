/**
 * Display formatting. The API stores raw numbers (seconds, meters);
 * everything you actually see on screen is produced here.
 */

/** 3138 → "52:18"  |  3738 → "1:02:18" */
export function formatDuration(totalSeconds: number): string {
  const s = Math.max(0, Math.floor(totalSeconds));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  const mm = String(m).padStart(2, '0');
  const ss = String(sec).padStart(2, '0');
  return h > 0 ? `${h}:${mm}:${ss}` : `${mm}:${ss}`;
}

/** Always h:mm:ss — used by the live stopwatch so the layout never jumps. */
export function formatStopwatch(totalSeconds: number): string {
  const s = Math.max(0, Math.floor(totalSeconds));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}`;
}

/** 372 → "6:12"  (seconds per km → m:ss) */
export function formatPace(secPerKm: number): string {
  if (!secPerKm || secPerKm <= 0) return "--:--";
  const m = Math.floor(secPerKm / 60);
  const s = Math.round(secPerKm % 60);
  return `${m}:${String(s).padStart(2, '0')}`;
}

/** 8423 → "8.42" */
export function metersToKm(meters: number, decimals = 2): string {
  return (meters / 1000).toFixed(decimals);
}

/** "8.42 km" */
export function formatKm(meters: number, decimals = 2): string {
  return `${metersToKm(meters, decimals)} km`;
}

/** 10.25 → "10.25" */
export function formatSpeed(kmh: number): string {
  return (Math.round(kmh * 100) / 100).toFixed(2);
}

/** ISO → "Oct 8" */
export function formatDayLabel(iso: string | Date): string {
  const d = typeof iso === 'string' ? new Date(iso) : iso;
  return new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric' }).format(d);
}

/** ISO → "Oct 8, 2026 · 6:14 AM" */
export function formatDateTime(iso: string | Date): string {
  const d = typeof iso === 'string' ? new Date(iso) : iso;
  const date = new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  }).format(d);
  const time = new Intl.DateTimeFormat('en-US', {
    hour: 'numeric',
    minute: '2-digit',
  }).format(d);
  return `${date} · ${time}`;
}

/** 1 → "1st", 22 → "22nd" */
export function ordinal(n: number): string {
  const s = ['th', 'st', 'nd', 'rd'];
  const v = n % 100;
  return n + (s[(v - 20) % 10] ?? s[v] ?? s[0]);
}
