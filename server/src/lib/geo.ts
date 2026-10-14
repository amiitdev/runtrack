export interface LatLng {
  lat: number;
  lon: number;
}

export interface TrackPoint extends LatLng {
  /** Epoch milliseconds when the GPS fix was taken. */
  time: number;
  altitude?: number | null;
  /** Meters/second reported by the device (may be 0 when signal is weak). */
  speed?: number | null;
  /** Horizontal accuracy in meters. Bigger = worse. */
  accuracy?: number | null;
  /**
   * Moving segment. A PAUSE → RESUME bumps the segment, and distance is
   * only ever summed between two points of the SAME segment. That is what
   * stops "I walked back to my car while paused" from showing up as km.
   */
  segment?: number;
}

export interface RouteStats {
  distanceMeters: number;
  maxSpeedKmh: number;
  elevationGainMeters: number;
  /** Points kept after filtering out low-accuracy fixes. */
  pointCount: number;
}

const EARTH_RADIUS_M = 6371008.8; // IUGG mean Earth radius

/** Degrees → radians. */
const toRad = (deg: number): number => (deg * Math.PI) / 180;

const segOf = (p: TrackPoint): number => p.segment ?? 0;

/**
 * Mirrors mobile/src/lib/geo.ts exactly — the phone and the server must
 * agree on what counts as movement, otherwise the live number and the saved
 * number drift apart.
 *
 *  MAX_SPEED_MPS      12 m/s (43 km/h) — above any human ⇒ teleport
 *  STILL_SPEED_MPS     1 m/s (3.6 km/h) — the chip says you are crawling
 *  STILL_IMPLIED_MPS   1 m/s (3.6 km/h) — the distance/time says so
 *
 * Both are required: they fail differently. Android sends speed 0.0 whenever
 * the provider has no speed data (so the chip rule goes quiet), while a
 * phone parked on a bed ticks only every 7–10 s (so the tape rule catches
 * it). Either one firing drops the fix.
 */
const MAX_SPEED_MPS = 12;
const STILL_SPEED_MPS = 1;
const STILL_IMPLIED_MPS = 1;

/**
 * Haversine formula — great-circle distance between two GPS fixes.
 *
 *        ┌─── c = 2·asin(√h)
 *        │    h = sin²(Δφ/2) + cos φ₁ · cos φ₂ · sin²(Δλ/2)
 *        │
 *   A ●───────● B     d = R · c
 *
 * Accuracy is ~0.5%, i.e. a few meters per kilometre — plenty for running.
 */
export function haversineMeters(a: LatLng, b: LatLng): number {
  const dLat = toRad(b.lat - a.lat);
  const dLon = toRad(b.lon - a.lon);
  const lat1 = toRad(a.lat);
  const lat2 = toRad(b.lat);

  const h =
    Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) ** 2;

  return 2 * EARTH_RADIUS_M * Math.asin(Math.min(1, Math.sqrt(h)));
}

/**
 * GPS noise: a stationary phone drifts tens of meters. We throw away fixes
 * worse than `maxAccuracy` meters, jumps shorter than `minStepMeters`,
 * teleports, and fixes where both the chip and the tape say "not moving".
 *
 * The first point of every new segment is always kept — it is the anchor
 * the next segment measures from.
 *
 * Skipping a point here behaves exactly like the phone skipping it: the next
 * fix is measured from the previous KEPT point, so distance is never lost.
 */
export function cleanPoints(
  points: TrackPoint[],
  opts: { maxAccuracy?: number; minStepMeters?: number } = {},
): TrackPoint[] {
  const maxAccuracy = opts.maxAccuracy ?? 30;
  const minStepMeters = opts.minStepMeters ?? 2;

  const kept: TrackPoint[] = [];
  for (const p of points) {
    if (p.accuracy != null && p.accuracy > maxAccuracy) continue;

    const prev = kept[kept.length - 1];
    if (!prev) {
      kept.push(p);
      continue;
    }

    // New segment → always keep (it is the re-entry anchor).
    if (segOf(prev) !== segOf(p)) {
      kept.push(p);
      continue;
    }

    const step = haversineMeters(prev, p);
    if (step < minStepMeters) continue; // jitter

    const dt = (p.time - prev.time) / 1000;
    if (dt <= 0) continue;
    const implied = step / dt;

    if (dt >= 0.5 && implied > MAX_SPEED_MPS) continue; // teleport

    // crawling on the chip, or crawling by the tape — either one drops it
    if (p.speed != null && p.speed > 0 && p.speed < STILL_SPEED_MPS) continue;
    if (implied < STILL_IMPLIED_MPS) continue;

    kept.push(p);
  }
  return kept;
}

/**
 * Turns a raw GPS track into the numbers shown on the summary screen.
 * Everything here is derived — never stored as the only copy of a run.
 */
export function computeRouteStats(points: TrackPoint[]): RouteStats {
  const pts = cleanPoints(points);

  let distanceMeters = 0;
  let maxSpeedKmh = 0;
  let elevationGainMeters = 0;
  let lastAltitude: number | null = null;

  for (let i = 0; i < pts.length; i++) {
    const p = pts[i];

    if (i > 0) {
      const prev = pts[i - 1];
      const sameSegment = segOf(prev) === segOf(p);

      if (sameSegment) {
        distanceMeters += haversineMeters(prev, p);

        // Prefer the GPS chip's own speed; fall back to what we can derive.
        let speedKmh = 0;
        if (p.speed != null && p.speed > 0) {
          speedKmh = p.speed * 3.6;
        } else {
          const dtSec = (p.time - prev.time) / 1000;
          if (dtSec > 0) speedKmh = (haversineMeters(prev, p) / dtSec) * 3.6;
        }
        if (speedKmh > maxSpeedKmh) maxSpeedKmh = speedKmh;
      }

      // Elevation gain: only climbs > 1 m so GPS jitter does not add up,
      // and never across a pause (you did not climb while standing still).
      if (sameSegment && typeof p.altitude === 'number' && lastAltitude != null) {
        const delta = p.altitude - lastAltitude;
        if (delta > 1) elevationGainMeters += delta;
      }
    }

    if (typeof p.altitude === 'number') lastAltitude = p.altitude;
  }

  return {
    distanceMeters,
    maxSpeedKmh,
    elevationGainMeters,
    pointCount: pts.length,
  };
}

export interface Split {
  /** 1-based kilometer number. */
  index: number;
  distanceMeters: number;
  durationSeconds: number;
  /** Seconds needed to cover ONE kilometer at this split's pace. */
  paceSecPerKm: number;
  elevationGainMeters: number;
}

/**
 * Slices a GPS track into ~1 km segments.
 * The final partial segment is kept when it is longer than 100 m, so a
 * 5.4 km run shows 6 splits (5 full + 1 partial).
 *
 * Pause gaps are removed from the clock the same way they are removed from
 * the distance: when the segment changes, `segStartMs` is pushed forward by
 * the gap, so the split pace is a MOVING pace.
 */
export function computeSplits(points: TrackPoint[]): Split[] {
  const pts = cleanPoints(points);
  const splits: Split[] = [];
  if (pts.length < 2) return splits;

  let index = 1;
  let segDistance = 0;
  let segStartMs = pts[0].time;
  let segElevation = 0;
  let lastAltitude = typeof pts[0].altitude === 'number' ? pts[0].altitude : null;

  const close = (distanceMeters: number, durationSeconds: number, push: boolean) => {
    if (!push && distanceMeters < 100) return;
    splits.push({
      index,
      distanceMeters: Math.round(distanceMeters),
      durationSeconds: Math.round(durationSeconds),
      paceSecPerKm:
        distanceMeters > 0 ? Math.round(durationSeconds / (distanceMeters / 1000)) : 0,
      elevationGainMeters: Math.round(segElevation),
    });
    index += 1;
    segDistance = 0;
    segElevation = 0;
  };

  for (let i = 1; i < pts.length; i++) {
    const prev = pts[i - 1];
    const p = pts[i];

    if (segOf(prev) !== segOf(p)) {
      // Segment boundary (a pause). Drop the dead time from the clock.
      segStartMs += p.time - prev.time;
      lastAltitude = typeof p.altitude === 'number' ? p.altitude : lastAltitude;
      continue;
    }

    segDistance += haversineMeters(prev, p);

    if (typeof p.altitude === 'number') {
      if (lastAltitude != null) {
        const delta = p.altitude - lastAltitude;
        if (delta > 1) segElevation += delta;
      }
      lastAltitude = p.altitude;
    }

    if (segDistance >= 1000) {
      close(segDistance, (p.time - segStartMs) / 1000, true);
      segStartMs = p.time;
    }
  }

  if (segDistance > 0 && segStartMs > 0) {
    close(segDistance, (pts[pts.length - 1].time - segStartMs) / 1000, false);
  }

  return splits;
}
