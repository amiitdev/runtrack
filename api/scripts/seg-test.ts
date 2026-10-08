import { computeRouteStats, computeSplits, type TrackPoint } from '../src/lib/geo.js';

const base = Date.parse('2026-10-08T06:00:00Z');
const pts: TrackPoint[] = [];

// Segment 0: a straight 1 km eastward run
for (let i = 0; i <= 20; i++) {
  pts.push({ lat: 25.5941, lon: 85.1376 + i * 0.0009, time: base + i * 33_000, segment: 0, accuracy: 5 });
}
// PAUSE: runner walks 5 km east while paused, then resumes at segment 1
const resumeBase = base + 60_000;
for (let i = 0; i <= 20; i++) {
  pts.push({
    lat: 25.5941,
    lon: 85.1376 + 0.045 + i * 0.0009,
    time: resumeBase + i * 33_000,
    segment: 1,
    accuracy: 5,
  });
}

const stats = computeRouteStats(pts);
const splits = computeSplits(pts);

console.log('points          :', pts.length);
console.log('distance (m)    :', stats.distanceMeters.toFixed(1));
console.log('  expected      : ~3612 (1806 m + 1806 m, the ~5 km pause gap excluded)');
console.log('elevation gain  :', stats.elevationGainMeters);
console.log('splits          :', JSON.stringify(splits));
console.log('gap excluded    :', Math.abs(stats.distanceMeters - 3612) < 100 ? 'PASS' : 'FAIL');
