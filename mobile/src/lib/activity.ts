/**
 * Is the person walking, jogging or running?
 *
 * Pure function of speed — no schema change needed, because `runs` already
 * stores `avg_speed_kmh`. Thresholds are MET-book style bands:
 *
 *   m/s      km/h      what
 *   ─────    ─────     ─────────────────────
 *   < 1.25   < 4.5     still / strolling
 *   < 2.0    < 7.2     walk
 *   < 2.8    < 10.1    jog
 *   < 4.0    < 14.4    run
 *   ≥ 4.0    ≥ 14.4    sprint
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
  { minMps: 4.0, activity: 'sprint' },
  { minMps: 2.8, activity: 'run' },
  { minMps: 2.0, activity: 'jog' },
  { minMps: 1.25, activity: 'walk' },
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
