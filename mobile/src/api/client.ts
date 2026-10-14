import { API_URL, APP_TZ } from '../config';
import type {
  ChartBucket,
  CreateRunPayload,
  CreateRunResponse,
  Dashboard,
  PersonalRecords,
  Profile,
  Run,
  RunDetail,
} from './types';

/** Long enough for a slow 20k-point upload, short enough to not hang the UI. */
const DEFAULT_TIMEOUT_MS = 15_000;

export class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly body?: unknown,
    readonly timedOut = false,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

/** Turns a raw network failure into something you can actually act on. */
function networkError(url: string, cause: unknown, timedOut: boolean): ApiError {
  const reason = timedOut
    ? `timed out after ${DEFAULT_TIMEOUT_MS / 1000}s`
    : 'is unreachable';

  return new ApiError(
    `Cannot reach the RunTrack API — ${url} ${reason}.\n` +
      `• Is "npm run dev" running in runtrack/api?\n` +
      `• Phone and laptop must be on the same Wi-Fi.\n` +
      `• ufw must allow 4000/tcp for your LAN subnet.`,
    0,
    { cause: String(cause) },
    timedOut,
  );
}

async function request<T>(
  path: string,
  init?: RequestInit & { timeoutMs?: number },
): Promise<T> {
  const timeoutMs = init?.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const url = `${API_URL}${path}`;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  let res: Response;
  try {
    res = await fetch(url, {
      ...init,
      signal: controller.signal,
      headers: { 'content-type': 'application/json', ...(init?.headers ?? {}) },
    });
  } catch (err) {
    const timedOut = err instanceof DOMException && err.name === 'AbortError';
    throw networkError(API_URL, err, timedOut);
  } finally {
    clearTimeout(timer);
  }

  const text = await res.text();
  const body = text ? safeJson(text) : null;

  if (!res.ok) {
    const msg =
      (body && typeof body === 'object' && 'error' in body
        ? String((body as { error: unknown }).error)
        : null) ?? `HTTP ${res.status}`;
    throw new ApiError(msg, res.status, body);
  }
  return body as T;
}

function safeJson(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

const tz = () => encodeURIComponent(APP_TZ);

export const api = {
  health: () => request<{ ok: boolean; runs: number }>('/health'),

  dashboard: () => request<Dashboard>(`/stats/dashboard?tz=${tz()}`),

  chart: (days: number) =>
    request<ChartBucket[]>(`/stats/chart?days=${days}&tz=${tz()}`),

  records: () => request<PersonalRecords>(`/stats/records?tz=${tz()}`),

  listRuns: (limit = 50, offset = 0) =>
    request<Run[]>(`/runs?limit=${limit}&offset=${offset}`),

  getRun: (id: string) => request<RunDetail>(`/runs/${id}`),

  deleteRun: (id: string) =>
    request<{ ok: boolean }>(`/runs/${id}`, { method: 'DELETE' }),

  /** Wipes all history (Settings → Clear history). */
  clearHistory: () =>
    request<{ ok: boolean; deleted: number }>('/runs', { method: 'DELETE' }),

  /**
   * Uploads the finished run. The caller keeps the payload on failure so the
   * runner can press RETRY instead of losing the whole run.
   */
  createRun: (payload: CreateRunPayload) =>
    request<CreateRunResponse>('/runs', {
      method: 'POST',
      body: JSON.stringify(payload),
      timeoutMs: 30_000, // up to 20k GPS points on a slow link
    }),

  profile: () => request<Profile>('/profile'),

  updateProfile: (
    patch: Partial<Pick<Profile, 'displayName' | 'weightKg' | 'strideMeters'>>,
  ) => request<Profile>('/profile', { method: 'PUT', body: JSON.stringify(patch) }),
};
