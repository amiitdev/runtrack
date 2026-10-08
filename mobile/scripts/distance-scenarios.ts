/**
 * How does the app behave when the phone is:
 *   A. lying still on a table        (GPS drift only)
 *   B. being shaken in your hand     (person not moving)
 *   C. in your pocket while running  (the normal case)
 *   D. hit by a single GPS teleport  (multipath glitch)
 *
 *   ../api/node_modules/.bin/tsx scripts/distance-scenarios.ts
 *
 * "truth" = how far the PERSON actually moved. The gap between truth and
 * what the app measured is the phantom distance.
 */
import { appendPoint, emptyRoute, type TrackPoint } from '../src/lib/geo';

const CENTER = { lat: 25.5941, lon: 85.1376 };
const M_LAT = 111_320;
const M_LON = 111_320 * Math.cos((CENTER.lat * Math.PI) / 180);
const TICK_MS = 2000;
const T0 = Date.parse('2026-10-08T06:00:00Z');

/** Deterministic RNG so every run gives identical numbers. */
let seed = 42;
const rand = () => {
  seed = (seed * 1664525 + 1013904223) % 4294967296;
  return seed / 4294967296;
};
const gauss = () => (rand() + rand() + rand() + rand() - 2) * 0.7; // ≈ N(0,1)

interface Measured {
  meters: number;
  accepted: number;
  seen: number;
}

function measure(points: TrackPoint[]): Measured {
  let route = emptyRoute();
  let seen = 0;
  for (const p of points) {
    seen += 1;
    const before = route;
    route = appendPoint(route, p);
    if (route === before && route.points[route.points.length - 1] !== p) continue;
  }
  return { meters: route.distanceMeters, accepted: route.points.length, seen };
}

function toLl(latOff: number, lonOff: number) {
  return { lat: CENTER.lat + latOff / M_LAT, lon: CENTER.lon + lonOff / M_LON };
}

/* ---------------- scenarios ---------------- */

/** A. Phone flat on a table. Person: 0 m. GPS wanders ~2 m per fix. */
function stationary(minutes: number): { points: TrackPoint[]; truth: number } {
  const n = (minutes * 60_000) / TICK_MS;
  const points: TrackPoint[] = [];
  let x = 0;
  let y = 0;
  for (let i = 0; i < n; i++) {
    x += gauss() * 2.0;
    y += gauss() * 2.0;
    const { lat, lon } = toLl(y, x);
    points.push({
      lat,
      lon,
      time: T0 + i * TICK_MS,
      altitude: 53,
      speed: Math.max(0, gauss() * 0.12), // chip reports ~0 when still
      accuracy: 5 + rand() * 6,
    });
  }
  return { points, truth: 0 };
}

/** B. Standing still, shaking the phone ±40 cm. Person: 0 m. */
function shaking(minutes: number): { points: TrackPoint[]; truth: number } {
  const n = (minutes * 60_000) / TICK_MS;
  const points: TrackPoint[] = [];
  let x = 0;
  let y = 0;
  for (let i = 0; i < n; i++) {
    // slow drift (phone still ends up on the same table) + hand wobble
    x += gauss() * 1.5 + Math.sin(i * 1.7) * 0.4;
    y += gauss() * 1.5 + Math.cos(i * 2.3) * 0.4;
    const { lat, lon } = toLl(y, x);
    points.push({
      lat,
      lon,
      time: T0 + i * TICK_MS,
      altitude: 53,
      speed: Math.max(0, 0.2 + gauss() * 0.4), // shaky hand makes the chip unsure
      accuracy: 6 + rand() * 10,
    });
  }
  return { points, truth: 0 };
}

/** C. Pocket while running 2.7 m/s for `minutes`, GPS noise ±2 m. */
function inPocket(minutes: number): { points: TrackPoint[]; truth: number } {
  const n = (minutes * 60_000) / TICK_MS;
  const speed = 2.7;
  const points: TrackPoint[] = [];
  let x = 0;
  let y = 0;
  const heading = 0.35; // radians, roughly east-north-east
  for (let i = 0; i < n; i++) {
    x += Math.cos(heading) * speed * (TICK_MS / 1000);
    y += Math.sin(heading) * speed * (TICK_MS / 1000);
    const { lat, lon } = toLl(y + gauss() * 2.0, x + gauss() * 2.0);
    points.push({
      lat,
      lon,
      time: T0 + i * TICK_MS,
      altitude: 53 + Math.sin(i / 20) * 4,
      speed: Math.max(0, speed + gauss() * 0.25),
      accuracy: 7 + rand() * 6, // body blocks some satellites
    });
  }
  return { points, truth: speed * (n * (TICK_MS / 1000)) };
}

/**
 * D. A normal run with ONE bad fix in the middle — classic multipath.
 * The bad fix is 100 m off for a single tick and then snaps back.
 * `accuracy: 20` deliberately stays under the 30 m gate, so only the
 * speed cap can catch it.
 */
function teleport(): { points: TrackPoint[]; truth: number } {
  const points: TrackPoint[] = [];
  const speed = 2.7;
  let x = 0;
  let y = 0;
  for (let i = 0; i < 150; i++) {
    x += speed * (TICK_MS / 1000);
    y += gauss() * 1.5;
    const bad = i === 80;
    const { lat, lon } = toLl(y, bad ? x + 100 : x); // one-tick 100 m spike
    points.push({
      lat,
      lon,
      time: T0 + i * TICK_MS,
      altitude: 53,
      speed: bad ? 50 : speed,
      accuracy: bad ? 20 : 6 + rand() * 4, // 20 m passes the 30 m gate
    });
  }
  return { points, truth: speed * 150 * (TICK_MS / 1000) };
}

/* ---------------- report ---------------- */
const pct = (m: number, t: number) =>
  t === 0 ? (m < 5 ? '≈0' : `+${m.toFixed(0)} m PHANTOM`) : `${((m / t - 1) * 100).toFixed(1)}%`;

const cases: Array<[string, ReturnType<typeof stationary>]> = [
  ['A. stationary on a table (5 min)', stationary(5)],
  ['B. shaking it in your hand (5 min)', shaking(5)],
  ['C. in pocket while running (5 min)', inPocket(5)],
  ['D. run + one 100 m glitch fix (acc 20 m)', teleport()],
];

console.log('\n🧪 DISTANCE SCENARIOS — current filters\n');
console.log(
  ['scenario'.padEnd(36), 'truth'.padStart(9), 'measured'.padStart(10), 'error'.padStart(20)].join('  '),
);
console.log('─'.repeat(36) + '  ' + '─'.repeat(9) + '  ' + '─'.repeat(10) + '  ' + '─'.repeat(20));

let failures = 0;
for (const [name, s] of cases) {
  const r = measure(s.points);
  const err = pct(r.meters, s.truth);
  const bad =
    (s.truth === 0 && r.meters > 20) || // phantom distance on a still phone
    (s.truth > 0 && Math.abs(r.meters / s.truth - 1) > 0.1);
  if (bad) failures += 1;
  console.log(
    [
      (bad ? '✘ ' : '✔ ') + name.padEnd(34),
      (s.truth === 0 ? '0 m' : `${s.truth.toFixed(0)} m`).padStart(9),
      `${r.meters.toFixed(0)} m`.padStart(10),
      err.padStart(20),
    ].join('  '),
  );
}

console.log(
  `\n${failures === 0 ? '✅ all scenarios trustworthy' : `❌ ${failures} scenario(s) over-report`}\n`,
);
