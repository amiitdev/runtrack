/**
 * Simulates a real-time run through the SAME code the phone uses:
 *
 *   GPS fix  →  appendPoint()  →  snapshot  →  mapPoints  →  <Polyline/>
 *
 *   ../server/node_modules/.bin/tsx scripts/live-pipeline.ts     (from mobile/)
 *
 * Proves that every accepted GPS tick grows the polyline, that the camera
 * region tracks the runner, and that noise / pause gaps never leak into the
 * distance shown on screen.
 */
import {
  appendPoint,
  emptyRoute,
  type LiveRouteState,
  type TrackPoint,
} from '../src/lib/geo';

const CENTER = { lat: 25.5941, lon: 85.1376 };
const M_PER_DEG_LAT = 111_320;
const M_PER_DEG_LON = 111_320 * Math.cos((CENTER.lat * Math.PI) / 180);

const SPEED_MS = 2.7; // ≈ 9.7 km/h
const TICK_MS = 2000; // expo-location `timeInterval`
const RUN_TICKS = 60; // 2 minutes of running

const T0 = Date.parse('2026-10-08T06:00:00Z');
let now = T0;
let segment = 0;
let route: LiveRouteState = emptyRoute();
let fixesSeen = 0;
let rejected = 0;

/** Exactly what run.tsx hands to <RouteMap/>. */
const mapPoints = () => route.points.map((p) => ({ latitude: p.lat, longitude: p.lon }));
const lastOf = <T,>(xs: T[]): T => xs[xs.length - 1];

function push(lat: number, lon: number, opts: { accuracy?: number; segment?: number } = {}) {
  now += TICK_MS;
  const point: TrackPoint = {
    lat,
    lon,
    time: now,
    altitude: 53 + Math.sin(now / 60_000) * 6,
    speed: SPEED_MS,
    accuracy: opts.accuracy ?? 5,
    segment: opts.segment ?? segment,
  };

  const before = route;
  route = appendPoint(route, point);
  fixesSeen += 1;
  if (route === before) rejected += 1;
}

/* ---------- 1. clean run: 60 fixes, one every 2 s, heading east ---------- */
const cleanRows: Array<{ km: number; pace: string; region: string; polyline: number }> = [];
for (let i = 0; i < RUN_TICKS; i++) {
  const east = i * SPEED_MS * (TICK_MS / 1000); // metres travelled so far
  push(CENTER.lat, CENTER.lon + east / M_PER_DEG_LON);

  const mp = mapPoints();
  const last = lastOf(mp);
  const elapsedSec = (now - T0) / 1000;
  const km = route.distanceMeters / 1000;
  const paceSec = km > 0 ? elapsedSec / km : 0;

  cleanRows.push({
    km,
    pace: `${Math.floor(paceSec / 60)}:${String(Math.round(paceSec % 60)).padStart(2, '0')}`,
    region: `${last.latitude.toFixed(5)}, ${last.longitude.toFixed(5)}`,
    polyline: mp.length,
  });
}

const kmAfterRun = route.distanceMeters;
const finalPace = cleanRows[cleanRows.length - 1].pace;

/* ---------- 2. noise: bad fix + sub-2 m jitter, both at the runner ---------- */
const runner = lastOf(route.points);
const pointsBefore = route.points.length;
push(runner.lat, runner.lon, { accuracy: 95 }); // satellite lost
const afterBad = route.points.length;
push(runner.lat + 5e-7, runner.lon + 5e-7, { accuracy: 6 }); // ~7 cm of drift
const afterJitter = route.points.length;

/* ---------- 3. PAUSE: walk 400 m east, resume in a new segment ---------- */
const kmBeforePause = route.distanceMeters;
const polylineBeforeResume = route.points.length;
segment = 1;
const anchor = lastOf(route.points);
push(anchor.lat, anchor.lon + 400 / M_PER_DEG_LON, { segment: 1 });
const kmAfterPause = route.distanceMeters;
const polylineAfterResume = route.points.length;

/* ---------- 4. keep running after the resume ---------- */
for (let i = 1; i <= 10; i++) {
  push(anchor.lat, anchor.lon + (400 + i * SPEED_MS * (TICK_MS / 1000)) / M_PER_DEG_LON, { segment: 1 });
}
const kmAfterResumeRun = route.distanceMeters;

/* ---------- assertions ---------- */
const m = (x: number) => `${x.toFixed(1)} m`;
const checks: Array<[string, boolean, string]> = [
  [
    'polyline grows on every accepted fix',
    cleanRows.every((r, i) => r.polyline === i + 1) && route.points.length > 0,
    `${cleanRows.length} ticks → ${cleanRows[cleanRows.length - 1].polyline} points`,
  ],
  [
    'camera region tracks the runner',
    cleanRows.every((r, i) => {
      const expected = `${route.points[i].lat.toFixed(5)}, ${route.points[i].lon.toFixed(5)}`;
      return r.region === expected;
    }),
    `region ${cleanRows[cleanRows.length - 1].region}`,
  ],
  [
    'distance climbs monotonically',
    cleanRows.every((r, i) => i === 0 || r.km >= cleanRows[i - 1].km),
    `${(kmAfterRun / 1000).toFixed(3)} km after ${RUN_TICKS} ticks`,
  ],
  [
    'pace converges on the simulated pace',
    (() => {
      const target = 1000 / SPEED_MS; // 370.4 s/km
      const got = Number(finalPace.split(':')[0]) * 60 + Number(finalPace.split(':')[1]);
      return Math.abs(got - target) < 15;
    })(),
    `${finalPace} /km (simulated ${Math.round(1000 / SPEED_MS)} s/km)`,
  ],
  [
    'fix with accuracy 95 m is rejected',
    afterBad === pointsBefore,
    `${pointsBefore} → ${afterBad} points`,
  ],
  [
    'jitter of ~7 cm is rejected',
    afterJitter === pointsBefore,
    `${pointsBefore} → ${afterJitter} points (${rejected} rejected total)`,
  ],
  [
    'PAUSE gap (400 m) is not counted',
    Math.abs(kmAfterPause - kmBeforePause) < 5,
    `${m(kmBeforePause)} → ${m(kmAfterPause)}`,
  ],
  [
    'resume point still lands on the map',
    polylineAfterResume === polylineBeforeResume + 1,
    `${polylineBeforeResume} → ${polylineAfterResume} polyline points`,
  ],
  [
    'distance climbs again after RESUME',
    kmAfterResumeRun - kmAfterPause > 20,
    `+${m(kmAfterResumeRun - kmAfterPause)} in the next 10 ticks`,
  ],
];

/* ---------- output ---------- */
console.log('\n⏱  LIVE MAP PIPELINE — clean run (first 8 ticks)\n');
const widths = [5, 9, 9, 7, 26];
const line = (c: string[]) => c.map((x, i) => x.padEnd(widths[i])).join('  ');
console.log(line(['tick', 'polyline', 'km', 'pace', 'map region']));
console.log(widths.map((w) => '─'.repeat(w)).join('  '));
cleanRows.slice(0, 8).forEach((r, i) => {
  console.log(line([String(i), String(r.polyline), r.km.toFixed(3), r.pace, r.region]));
});
console.log('  ⋮');
const lastIdx = cleanRows.length - 1;
console.log(
  line([
    String(lastIdx),
    String(cleanRows[lastIdx].polyline),
    cleanRows[lastIdx].km.toFixed(3),
    cleanRows[lastIdx].pace,
    cleanRows[lastIdx].region,
  ]),
);

console.log('\n✅ CHECKS\n');
let failed = 0;
for (const [name, ok, detail] of checks) {
  if (!ok) failed += 1;
  console.log(`  ${ok ? '✔' : '✘'} ${name.padEnd(38)} ${detail}`);
}

console.log(
  `\n${failed === 0 ? '✅ ALL PASSED' : `❌ ${failed} FAILED`} — ` +
    `${route.points.length} polyline points, ` +
    `${(route.distanceMeters / 1000).toFixed(3)} km live distance, ` +
    `${fixesSeen} fixes seen / ${rejected} rejected\n`,
);
process.exit(failed === 0 ? 0 : 1);
