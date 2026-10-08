/**
 * Pure metric conversions used by both the API (to persist) and the mobile
 * app (to display). Keep this file dependency-free so it can be mirrored
 * exactly on the phone.
 */

export const SEC_PER_HOUR = 3600;
export const SEC_PER_MINUTE = 60;

/** meters → km, rounded to 2 decimals. */
export const metersToKm = (meters: number): number => Math.round((meters / 1000) * 100) / 100;

/**
 * Pace = time / distance, expressed as SECONDS per kilometer.
 * We store seconds (a number) instead of "6:12" (a string) so it can be
 * averaged, sorted and charted. Formatting happens on the client.
 *
 *   3138 s / 8.42 km = 372.7 s/km = 6:13 /km
 */
export function paceSecPerKm(durationSeconds: number, distanceMeters: number): number {
  if (distanceMeters <= 0) return 0;
  const km = distanceMeters / 1000;
  return Math.round(durationSeconds / km);
}

/** km/h from meters + seconds. */
export function avgSpeedKmh(distanceMeters: number, durationSeconds: number): number {
  if (durationSeconds <= 0) return 0;
  return Math.round(((distanceMeters / 1000) / (durationSeconds / SEC_PER_HOUR)) * 100) / 100;
}

/**
 * Calories via the MET (Metabolic Equivalent of Task) method:
 *
 *   kcal = MET × weightKg × hours
 *
 * MET values come from the ACSM running tables. Because they are published
 * at a handful of speeds, we linearly interpolate between the neighbours.
 */
const MET_TABLE: ReadonlyArray<{ kmh: number; met: number }> = [
  { kmh: 4.8, met: 3.0 }, // very slow jog / walk
  { kmh: 6.4, met: 4.5 },
  { kmh: 8.0, met: 8.3 },
  { kmh: 9.7, met: 9.8 },
  { kmh: 10.8, met: 11.0 },
  { kmh: 11.3, met: 11.8 },
  { kmh: 12.9, met: 12.8 },
  { kmh: 14.5, met: 14.5 },
  { kmh: 16.1, met: 16.0 },
  { kmh: 17.7, met: 19.0 },
  { kmh: 19.3, met: 23.0 },
  { kmh: 22.5, met: 30.0 }, // sprint
];

export function metForSpeedKmh(speedKmh: number): number {
  const table = MET_TABLE;
  if (speedKmh <= table[0].kmh) return table[0].met;
  const last = table[table.length - 1];
  if (speedKmh >= last.kmh) return last.met;

  for (let i = 1; i < table.length; i++) {
    const lo = table[i - 1];
    const hi = table[i];
    if (speedKmh <= hi.kmh) {
      const t = (speedKmh - lo.kmh) / (hi.kmh - lo.kmh);
      return lo.met + t * (hi.met - lo.met);
    }
  }
  return last.met;
}

export function caloriesFor(
  distanceMeters: number,
  durationSeconds: number,
  weightKg: number,
): number {
  if (durationSeconds <= 0 || distanceMeters <= 0) return 0;
  const speedKmh = avgSpeedKmh(distanceMeters, durationSeconds);
  const met = metForSpeedKmh(speedKmh);
  const hours = durationSeconds / SEC_PER_HOUR;
  return Math.round(met * weightKg * hours);
}

/** Steps ≈ distance / stride length. Used when the phone has no pedometer. */
export function estimateSteps(distanceMeters: number, strideMeters: number): number {
  if (strideMeters <= 0) return 0;
  return Math.round(distanceMeters / strideMeters);
}
