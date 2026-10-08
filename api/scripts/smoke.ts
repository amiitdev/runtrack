/** End-to-end check: a run with a PAUSE must not count the gap. */
const API = process.env.API_URL ?? 'http://localhost:4000';

const base = Date.parse('2026-10-08T18:00:00Z');
const pts: any[] = [];

// Segment 0: 1 km eastward, 3 s apart
for (let i = 0; i <= 20; i++)
  pts.push({ lat: 25.5941, lon: 85.1376 + i * 0.0009, time: base + i * 33_000, accuracy: 5, segment: 0 });

// PAUSE: 5 km jump east, then segment 1 runs 1 km further
const resume = base + 120_000;
for (let i = 0; i <= 20; i++)
  pts.push({ lat: 25.5941, lon: 85.1826 + i * 0.0009, time: resume + i * 3000, accuracy: 5, segment: 1 });

const durationSeconds = 180 + 120 + 180; // moving only, pause excluded

const res = await fetch(`${API}/runs`, {
  method: 'POST',
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify({
    startedAt: new Date(base).toISOString(),
    endedAt: new Date(base + durationSeconds * 1000).toISOString(),
    durationSeconds,
    points: pts,
  }),
});
const body: any = await res.json();
if (!res.ok) { console.error('FAILED', res.status, JSON.stringify(body)); process.exit(1); }

const km = body.run.distanceMeters / 1000;
console.log('POST /runs        →', res.status);
console.log('points saved      →', body.pointsSaved);
console.log('distance          →', km.toFixed(2), 'km');
console.log('splits            →', body.splits.length, '(', body.splits.map((s: any) => s.distanceMeters + 'm').join(', '), ')');
console.log('duration          →', body.run.durationSeconds, 's');
console.log('pace              →', body.run.avgPaceSecPerKm, 's/km');
console.log('calories          →', body.run.calories);
console.log('gap excluded      →', km < 4 ? 'PASS' : 'FAIL');
console.log('pause in clock    →', body.run.durationSeconds === durationSeconds ? 'PASS' : 'FAIL');

const detail = await fetch(`${API}/runs/${body.run.id}`).then((r) => r.json());
console.log('GET /runs/:id     → points', detail.points.length, '| splits', detail.splits.length,
  '| segments', [...new Set(detail.points.map((p: any) => p.segment))].join(','));
const del = await fetch(`${API}/runs/${body.run.id}`, { method: 'DELETE' });
console.log('DELETE /runs/:id  →', del.status);
