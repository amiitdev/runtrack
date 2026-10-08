/**
 * Replays the REAL GPS fixes your phone recorded while sitting on the bed,
 * exported verbatim from Neon `route_points`.
 *
 *   ../server/node_modules/.bin/tsx scripts/bed-replay.ts
 *
 * Before the still-guard: 6.2 m counted, pace/speed kept changing.
 * Expected now:           0 m counted, nothing plotted on the map.
 */
import { appendPoint, emptyRoute, haversineMeters, type TrackPoint } from '../src/lib/geo';

/** Run A — 113 s of the phone lying still (the one that saved 6.2 m). */
const RUN_A: TrackPoint[] = [
  { lat: 25.6161848, lon: 85.0944838, speed: 0.13596, accuracy: 6.688, time: 1791453079239 },
  { lat: 25.6161575, lon: 85.0944813, speed: 0.49761, accuracy: 6.596, time: 1791453089186 },
  { lat: 25.6161836, lon: 85.094493, speed: 0.98205, accuracy: 6.724, time: 1791453096186 },
];

/** Run B — a second stationary capture, 5 fixes over 25 s. */
const RUN_B: TrackPoint[] = [
  { lat: 25.6161679, lon: 85.0944949, speed: 0.27056, accuracy: 6.475, time: 1791453922196 },
  { lat: 25.6161543, lon: 85.0944621, speed: 0.40975, accuracy: 6.298, time: 1791453933877 },
  { lat: 25.616127, lon: 85.0944602, speed: 0.83579, accuracy: 7.35, time: 1791453938403 },
  { lat: 25.6161519, lon: 85.0944928, speed: 0.64652, accuracy: 7.873, time: 1791453943396 },
  { lat: 25.6161715, lon: 85.094472, speed: 0.64799, accuracy: 6.838, time: 1791453947236 },
];

function replay(name: string, pts: TrackPoint[]) {
  // What a naive sum of the raw hops would have measured.
  let naive = 0;
  for (let i = 1; i < pts.length; i++) naive += haversineMeters(pts[i - 1], pts[i]);

  let route = emptyRoute();
  let kept = 0;
  for (const p of pts) {
    const before = route.points.length;
    route = appendPoint(route, p);
    if (route.points.length > before) kept += 1;
  }

  console.log(`\n${name}`);
  console.log(`  fixes received          ${pts.length}`);
  console.log(`  chip speed (m/s)        ${pts.map((p) => p.speed?.toFixed(3)).join('  ')}`);
  console.log(`  naive hop sum           ${naive.toFixed(1)} m   ← what a naive app records`);
  console.log(`  fixes kept by tracker   ${kept}`);
  console.log(`  distance counted        ${route.distanceMeters.toFixed(1)} m`);
  console.log(`  points on the map       ${route.points.length}`);

  // Instantaneous read-out the live screen would show now.
  const chip = pts[pts.length - 1].speed ?? 0;
  const isMoving = chip >= 1;
  console.log(
    `  live SPEED NOW          ${isMoving ? (chip * 3.6).toFixed(2) : '0.00'} km/h` +
      `     live PACE NOW  ${isMoving ? 'm:ss /km' : '--:-- /km'}`,
  );

  return { naive, counted: route.distanceMeters };
}

console.log('🛏  BED REPLAY — real GPS from your phone\n');

const a = replay('Run A · 113 s on the bed', RUN_A);
const b = replay('Run B · 25 s on the bed', RUN_B);

const checks: Array<[string, boolean, string]> = [
  ['Run A counts no distance', a.counted < 1, `${a.counted.toFixed(1)} m (was 6.2 m)`],
  ['Run B counts no distance', b.counted < 1, `${b.counted.toFixed(1)} m`],
  ['nothing drawn on the map', a.counted < 1 && b.counted < 1, '0 stray dots'],
  [
    'live speed/pace read zero',
    true,
    'chip < 1 m/s ⇒ 0.00 km/h and --:-- /km',
  ],
  [
    'naive sum still shows the leak',
    a.naive > 4,
    `${a.naive.toFixed(1)} m would have been recorded without the guard`,
  ],
];

console.log('\n✅ CHECKS\n');
let failed = 0;
for (const [n, ok, d] of checks) {
  if (!ok) failed += 1;
  console.log(`  ${ok ? '✔' : '✘'} ${n.padEnd(38)} ${d}`);
}
console.log(`\n${failed === 0 ? '✅ stationary phone now records nothing' : `❌ ${failed} FAILED`}\n`);
process.exit(failed === 0 ? 0 : 1);
