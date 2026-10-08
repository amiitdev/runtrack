/**
 * Is the person walking, jogging or running?
 *
 * Pure function of speed — no schema change needed, because `runs` already
 * stores `avg_speed_kmh`. Thresholds are MET-book style bands:
 *
 *   m/s      km/h       what
 *   ─────    ─────      ─────────────────────
 *   < 1.0    < 3.6      still          ← same floor as MOVING_MIN_MPS
 *   < 1.8    < 6.5      walk
 *   < 2.5    < 9.0      jog
 *   < 3.6    < 13.0     run
 *   ≥ 3.6    ≥ 13.0     sprint
 *
 * The walk floor is deliberately identical to MOVING_MIN_MPS, so anything
 * the tracker counts as distance is also classified as movement — a slow
 * 4.3 km/h stroll reads WALK, never STILL.
 */
export type Activity = 'still' | 'walk' | 'jog' | 'run' | 'sprint';

export const ACTIVITY_LABEL: Record<Activity, string> = {
  still: 'STILL',
  walk: 'WALK',
  jog: 'JOG',
  run: 'RUN',
  sprint: 'SPRINT',
};

const BANDS: { minMps: number; activity: Activity }[] = [
  { minMps: 3.6, activity: 'sprint' }, // ≥ 13.0 km/h
  { minMps: 2.5, activity: 'run' }, // ≥  9.0 km/h
  { minMps: 1.8, activity: 'jog' }, // ≥  6.5 km/h
  { minMps: 1.0, activity: 'walk' }, // ≥  3.6 km/h — mirrors MOVING_MIN_MPS
  { minMps: 0, activity: 'still' },
];

/** Speed in metres/second → activity label. */
export function classifyActivity(speedMps: number): Activity {
  const v = Number.isFinite(speedMps) && speedMps > 0 ? speedMps : 0;
  for (const band of BANDS) if (v >= band.minMps) return band.activity;
  return 'still';
}

/** Convenience for endpoints that only carry km/h (e.g. `runs.avg_speed_kmh`). */
export function classifyActivityKmh(speedKmh: number): Activity {
  return classifyActivity((speedKmh || 0) / 3.6);
}

/** Colour used by the badge, keyed to the app theme. */
export const ACTIVITY_COLOR: Record<Activity, string> = {
  still: '#5D6E8C',
  walk: '#A3E635',
  jog: '#22D3EE',
  run: '#FBBF24',
  sprint: '#F87171',
};
