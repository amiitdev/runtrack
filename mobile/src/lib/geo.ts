/**
 * Live GPS maths — the phone-side mirror of api/src/lib/geo.ts.
 *
 * The server recomputes everything when the run is saved, so these numbers
 * are only a preview: they must be fast, not authoritative.
 */

export interface TrackPoint {
  lat: number;
  lon: number;
  /** Epoch milliseconds. */
  time: number;
  altitude?: number | null;
  /** Meters/second from the GPS chip. */
  speed?: number | null;
  accuracy?: number | null;
  /**
   * Moving segment. The tracker bumps this on every PAUSE → RESUME so the
   * server never sums distance across the gap.
   */
  segment?: number;
}

const EARTH_RADIUS_M = 6371008.8;
const toRad = (deg: number): number => (deg * Math.PI) / 180;

/** Speed ceilings/floors used to tell a run apart from noise. */
export const MAX_SPEED_MPS = 12;   // 43 km/h — above any human ⇒ teleport
export const STILL_SPEED_MPS = 1;  // 3.6 km/h — chip says you are not moving
export const STILL_IMPLIED_MPS = 1; // 3.6 km/h — tape says you are not moving

/** Below this the live screen treats you as standing still. */
export const MOVING_MIN_MPS = 1;

/** Great-circle distance in meters between two fixes. */
export function haversineMeters(
  a: { lat: number; lon: number },
  b: { lat: number; lon: number },
): number {
  const dLat = toRad(b.lat - a.lat);
  const dLon = toRad(b.lon - a.lon);
  const lat1 = toRad(a.lat);
  const lat2 = toRad(b.lat);
  const h =
    Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) ** 2;
  return 2 * EARTH_RADIUS_M * Math.asin(Math.min(1, Math.sqrt(h)));
}

export interface LiveRouteState {
  points: TrackPoint[];
  distanceMeters: number;
  maxSpeedKmh: number;
  elevationGainMeters: number;
}

export const emptyRoute = (): LiveRouteState => ({
  points: [],
  distanceMeters: 0,
  maxSpeedKmh: 0,
  elevationGainMeters: 0,
});

/**
 * Appends one GPS fix and returns the new cumulative totals.
 *
 * Guards against the four things that fake distance on a phone:
 *   1. accuracy worse than 30 m        — the fix is simply unreliable
 *   2. jump smaller than 2 m           — jitter, not movement
 *   3. jump ACROSS a segment           — the pause gap
 *   4. implied speed > 12 m/s          — a teleport, not a runner
 *   5. chip says "still" AND barely moved — you left it on a table
 *
 * Rule 5 needs BOTH signals on purpose: Android reports speed 0.0 whenever
 * the provider has no speed data, so speed alone would wipe out a whole run.
 * It is also only judged on a normal 2 s tick, so one rejection cannot
 * cascade into "you never moved".
 *
 * Rule 3 mirrors the server exactly, so the number on the live screen and
 * the number saved to Neon can never drift apart.
 */
export function appendPoint(state: LiveRouteState, p: TrackPoint): LiveRouteState {
  if (p.accuracy != null && p.accuracy > 30) return state;

  const prev = state.points[state.points.length - 1];
  if (!prev) return { ...state, points: [p] };

  const sameSegment = (p.segment ?? 0) === (prev.segment ?? 0);

  // Segment boundary: keep the point as the new anchor but add no distance,
  // no speed and no elevation — the clock and the tape both skip the pause.
  if (!sameSegment) return { ...state, points: [...state.points, p] };

  const step = haversineMeters(prev, p);
  if (step < 2) return state;

  const dt = (p.time - prev.time) / 1000;
  if (dt <= 0) return state;
  const implied = step / dt;

  // (4) teleport / multipath
  if (dt >= 0.5 && implied > MAX_SPEED_MPS) return state;

  // (5) not actually going anywhere.
  //
  // Either the chip reports a crawl, OR the distance gained per second says
  // so. Two independent signals because they fail differently:
  //   · a device with no speed provider sends exactly 0  → chip rule off,
  //     but a still phone on a bed ticks every 7–10 s so the tape rule fires
  //   · a device that DOES report speed is caught even on 2 s ticks
  //
  // The tape rule is self-healing: while you actually move ≥ 1 m/s the next
  // fix measures from the previous anchor over a longer dt, implied rises
  // back above the floor and the point is accepted again.
  if (p.speed != null && p.speed > 0 && p.speed < STILL_SPEED_MPS) return state;
  if (implied < STILL_IMPLIED_MPS) return state;

  let speedKmh: number;
  if (p.speed != null && p.speed > 0) {
    speedKmh = p.speed * 3.6;
  } else {
    speedKmh = implied * 3.6;
  }

  let gain = state.elevationGainMeters;
  if (typeof p.altitude === 'number' && typeof prev.altitude === 'number') {
    const delta = p.altitude - prev.altitude;
    if (delta > 1) gain += delta;
  }

  return {
    points: [...state.points, p],
    distanceMeters: state.distanceMeters + step,
    maxSpeedKmh: Math.max(state.maxSpeedKmh, speedKmh),
    elevationGainMeters: gain,
  };
}
