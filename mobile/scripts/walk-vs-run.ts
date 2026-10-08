/**
 * Two questions, two experiments:
 *
 *   1. walking around the house with the phone in a pocket — counted?
 *   2. running laps around the park — counted?
 *
 *   ../server/node_modules/.bin/tsx scripts/walk-vs-run.ts
 *
 * Indoor GPS is modelled the way it really behaves indoors: 12–30 m
 * accuracy and position noise that SWAMPS the 1–2 m you actually moved.
 * Outdoor is modelled as a normal 400 m oval with 4–8 m accuracy.
 */
import { appendPoint, emptyRoute, haversineMeters, type TrackPoint } from '../src/lib/geo';

const M_LAT = 111_320;
let seed = 7;
const rand = () => {
  seed = (seed * 1664525 + 1013904223) % 4294967296;
  return seed / 4294967296;
};
const gauss = () => (rand() + rand() + rand() + rand() - 2) * 0.7;
const T0 = Date.parse('2026-10-08T06:00:00Z');

interface Outcome {
  name: string;
  truthM: number;
  measuredM: number;
  kept: number;
  seen: number;
  paceSecPerKm: number | null;
  speedKmh: number;
  notes: string;
}

function run(
  name: string,
  points: TrackPoint[],
  durationSec: number,
  notes: string,
): Outcome {
  let route = emptyRoute();
  let kept = 0;
  for (const p of points) {
    const n = route.points.length;
    route = appendPoint(route, p);
    if (route.points.length > n) kept += 1;
  }
  const km = route.distanceMeters / 1000;
  const hours = durationSec / 3600;
  return {
    name,
    truthM: Number.NaN,
    measuredM: route.distanceMeters,
    kept,
    seen: points.length,
    paceSecPerKm: km > 0 ? Math.round(durationSec / km) : null,
    speedKmh: hours > 0 ? km / hours : 0,
    notes,
  };
}

/* ------------------------------------------------------------------ */
/* 1. INSIDE THE HOUSE — you take ~15 steps from room to room          */
/* ------------------------------------------------------------------ */
function houseWalk(): { points: TrackPoint[]; truth: number } {
  const speed = 1.1; // normal indoor walk
  const tick = 3;
  const minutes = 2;
  const n = (minutes * 60) / tick;
  const points: TrackPoint[] = [];
  let x = 0;
  let y = 0;

  for (let i = 0; i < n; i++) {
    // You pace back and forth along an 8 m hallway, 15 round trips.
    const phase = (i * speed * tick) % 16; // 8 m out + 8 m back
    x = phase <= 8 ? phase : 16 - phase;
    y = Math.sin(i / 9) * 3;

    // …but indoors the fix jumps around by ±8 m and accuracy collapses.
    const jx = gauss() * 8;
    const jy = gauss() * 8;
    const accuracy = 12 + rand() * 18; // 12–30 m
    const reportedSpeed = 0.4 + rand() * 0.8; // fused provider under-reads

    points.push({
      lat: 25.5941 + (y + jy) / M_LAT,
      lon: 85.1376 + (x + jx) / 102578,
      time: T0 + i * tick * 1000,
      altitude: 53,
      speed: reportedSpeed,
      accuracy,
    });
  }
  return { points, truth: speed * (minutes * 60) };
}

/* ------------------------------------------------------------------ */
/* 2. PARK LAPS — 5 × 400 m oval at a steady 10 km/h                  */
/* ------------------------------------------------------------------ */
function parkLaps(laps: number): { points: TrackPoint[]; truth: number } {
  const speed = 2.8; // 10 km/h
  const tick = 2;
  const circumference = 400;
  const radius = circumference / (2 * Math.PI);
  const stepPerTick = speed * tick;
  const totalSteps = Math.round((laps * circumference) / stepPerTick);

  const points: TrackPoint[] = [];
  const clean: Array<{ lat: number; lon: number }> = [];
  const cx = 0;
  const cy = 0;

  for (let i = 0; i <= totalSteps; i++) {
    const travelled = i * stepPerTick;
    const angle = (travelled / circumference) * 2 * Math.PI;
    const bx = cx + Math.cos(angle) * radius;
    const by = cy + Math.sin(angle) * radius * 0.7; // slightly oval

    // Ground truth = the noise-free line the runner actually traced.
    clean.push({ lat: 25.5941 + by / M_LAT, lon: 85.1376 + bx / 102578 });

    points.push({
      lat: 25.5941 + (by + gauss() * 2.5) / M_LAT,
      lon: 85.1376 + (bx + gauss() * 2.5) / 102578,
      time: T0 + i * tick * 1000,
      altitude: 53 + Math.sin(angle * 3) * 5,
      speed: speed + gauss() * 0.3,
      accuracy: 4 + rand() * 4, // 4–8 m, out in the open
    });
  }

  let truth = 0;
  for (let i = 1; i < clean.length; i++) truth += haversineMeters(clean[i - 1], clean[i]);
  return { points, truth };
}

/* ------------------------------------------------------------------ */
/* 3. SLOW OUTDOOR WALK — sanity check on the 1 m/s floor             */
/* ------------------------------------------------------------------ */
function slowWalk(): { points: TrackPoint[]; truth: number } {
  const speed = 1.3; // 4.7 km/h
  const tick = 2;
  const minutes = 5;
  const n = (minutes * 60) / tick;
  const points: TrackPoint[] = [];
  for (let i = 0; i < n; i++) {
    const east = i * speed * tick;
    points.push({
      lat: 25.5941 + gauss() * 2 / M_LAT,
      lon: 85.1376 + (east + gauss() * 2) / 102578,
      time: T0 + i * tick * 1000,
      altitude: 53,
      speed: speed + gauss() * 0.2,
      accuracy: 5 + rand() * 4,
    });
  }
  return { points, truth: speed * (minutes * 60) };
}

/* ---------------- run them ---------------- */
const hw = houseWalk();
const pl = parkLaps(5);
const sw = slowWalk();

const results: Outcome[] = [
  { ...run('1. Walking inside the house (2 min)', hw.points, 120, 'indoor GPS is noise-dominated'),
    truthM: hw.truth },
  { ...run('2. Running 5 laps of the park (11 min)', pl.points, 668, 'outdoor, 4–8 m accuracy'),
    truthM: pl.truth },
  { ...run('3. Slow walk outside (5 min, 4.7 km/h)', sw.points, 300, 'just above the 1 m/s floor'),
    truthM: sw.truth },
];

console.log('\n🏠 vs 🏞️  INDOOR WALK vs PARK LAPS\n');
const hdr = ['scenario'.padEnd(38), 'truth'.padStart(8), 'measured'.padStart(10), 'kept'.padStart(9), 'pace'.padStart(10)];
console.log(hdr.join('  '));
console.log(hdr.map((h) => '─'.repeat(h.length)).join('  '));

for (const r of results) {
  const pct =
    r.truthM > 0 ? `${((r.measuredM / r.truthM - 1) * 100).toFixed(1)}%` : 'n/a';
  console.log(
    [
      r.name.padEnd(38),
      `${r.truthM.toFixed(0)} m`.padStart(8),
      `${r.measuredM.toFixed(0)} m`.padStart(10),
      `${r.kept}/${r.seen}`.padStart(9),
      (r.paceSecPerKm ? `${Math.floor(r.paceSecPerKm / 60)}:${String(r.paceSecPerKm % 60).padStart(2, '0')}` : '—').padStart(10),
    ].join('  '),
  );
}

const park = results[1];
const house = results[0];
const walk = results[2];

const parkErr = Math.abs(park.measuredM / park.truthM - 1);
const checks: Array<[string, boolean, string]> = [
  [
    'park laps land within 5%',
    parkErr < 0.05,
    `${park.measuredM.toFixed(0)} m of ${park.truthM.toFixed(0)} m (±${(parkErr * 100).toFixed(1)}%)`,
  ],
  ['park pace is believable', (park.paceSecPerKm ?? 9999) < 420, `${park.paceSecPerKm} s/km`],
  [
    'park polyline closes the loop',
    house.kept >= 0 && park.kept > park.seen * 0.7,
    `${park.kept} of ${park.seen} fixes plotted`,
  ],
  [
    'house walk does not invent distance',
    house.measuredM < house.truthM * 0.4,
    `${house.measuredM.toFixed(0)} m of ${house.truthM.toFixed(0)} m — indoor fixes are unusable`,
  ],
  [
    'slow outdoor walk IS counted',
    walk.measuredM / walk.truthM > 0.9 && walk.measuredM / walk.truthM < 1.1,
    `${walk.measuredM.toFixed(0)} m of ${walk.truthM.toFixed(0)} m`,
  ],
];

console.log('\n✅ CHECKS\n');
let failed = 0;
for (const [n, ok, d] of checks) {
  if (!ok) failed += 1;
  console.log(`  ${ok ? '✔' : '✘'} ${n.padEnd(40)} ${d}`);
}
console.log(
  `\n${failed === 0 ? '✅ expected behaviour everywhere' : `❌ ${failed} FAILED`}\n`,
);
process.exit(failed === 0 ? 0 : 1);
