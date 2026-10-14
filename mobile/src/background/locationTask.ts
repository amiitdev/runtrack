import AsyncStorage from '@react-native-async-storage/async-storage';
import * as TaskManager from 'expo-task-manager';
import type { LocationObject } from 'expo-location';
import type { TrackPoint } from '../lib/geo';

/**
 * Background GPS task.
 *
 * WHY THIS EXISTS — the first field test ran 20 min in a park and recorded
 * only the first 19 seconds. `Location.watchPositionAsync` is a
 * *foreground-only* stream: the moment the screen locks or the app loses
 * focus (which is exactly what happens when you start running) Android stops
 * delivering fixes. The clock kept ticking, the distance did not.
 *
 * `Location.startLocationUpdatesAsync` runs a TaskManager task instead, which
 * keeps receiving fixes with the screen off and even if the JS view tree is
 * unmounted.
 *
 * ┌──────────────┐   same Location objects   ┌────────────────────────┐
 * │  background  │ ────────────────────────► │ AsyncStorage           │
 * │  task        │   (survives screen off)   │ 'runtrack:live-points' │
 * └──────────────┘                           └───────────┬────────────┘
 *                                                        │ polled ~1×/s
 * ┌──────────────┐                                       ▼
 * │  foreground  │ ───────────────────────►  routeRef  ──► UI + save
 * │  watch       │   (instant feedback)
 * └──────────────┘
 *
 * The two sources never write to the same place — the task owns AsyncStorage,
 * the UI owns `routeRef` — so there is no read-modify-write race. Merging is
 * a read, and duplicates are dropped by timestamp (and by the < 2 m step
 * filter as a second line of defence).
 *
 * `TaskManager.defineTask` MUST run in the global scope of the bundle, which
 * is why `app/_layout.tsx` imports this module for its side effect.
 */
export const BG_LOCATION_TASK = 'runtrack-bg-location';
export const LIVE_POINTS_KEY = 'runtrack:live-points';

/** Normalise an expo LocationObject into the shape the tracker consumes. */
export function toTrackPoint(loc: LocationObject): TrackPoint {
  const c = loc.coords;
  return {
    lat: c.latitude,
    lon: c.longitude,
    time: loc.timestamp,
    altitude: c.altitude ?? null,
    speed: c.speed ?? null,
    accuracy: c.accuracy ?? null,
  };
}

async function appendLivePoints(points: TrackPoint[]): Promise<void> {
  if (points.length === 0) return;
  const raw = await AsyncStorage.getItem(LIVE_POINTS_KEY);
  const existing: TrackPoint[] = raw ? (JSON.parse(raw) as TrackPoint[]) : [];

  const seen = new Set(existing.map((p) => p.time));
  let added = 0;
  for (const p of points) {
    if (seen.has(p.time)) continue;
    seen.add(p.time);
    existing.push(p);
    added += 1;
  }
  if (added === 0) return;

  // Cap so a forgotten run cannot grow without bound.
  const capped = existing.length > 20_000 ? existing.slice(-20_000) : existing;
  await AsyncStorage.setItem(LIVE_POINTS_KEY, JSON.stringify(capped));
}

/** Runs in a headless JS context — must never throw. */
TaskManager.defineTask<{ locations?: LocationObject[] }>(
  BG_LOCATION_TASK,
  async ({ data, error }) => {
    if (error) {
      // The OS revoked the service or the app was killed mid-run.
      console.warn('[runtrack] background location error:', error);
      return;
    }
    const locations = data?.locations;
    if (!locations || locations.length === 0) return;

    try {
      await appendLivePoints(locations.map(toTrackPoint));
    } catch (err) {
      console.warn('[runtrack] could not persist background fixes:', err);
    }
  },
);

/** Everything the background task has collected so far. */
export async function readLivePoints(): Promise<TrackPoint[]> {
  try {
    const raw = await AsyncStorage.getItem(LIVE_POINTS_KEY);
    return raw ? (JSON.parse(raw) as TrackPoint[]) : [];
  } catch {
    return [];
  }
}

/** Called on START — a previous run's leftovers must never leak in. */
export async function resetLivePoints(): Promise<void> {
  await AsyncStorage.removeItem(LIVE_POINTS_KEY);
}
