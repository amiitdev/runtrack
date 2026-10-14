/**
 * Seeds the Neon database with synthetic runs so the dashboard, charts and
 * records have something to show before you have been out for a real run.
 *
 *   npx tsx scripts/seed.ts          (API must be running on :4000)
 *
 * Every run goes through POST /runs, so seeding exercises exactly the same
 * code path (haversine → splits → calories → INSERT) as the phone does.
 */

const API = process.env.API_URL ?? 'http://localhost:4000';
const TZ = process.env.APP_TZ ?? 'Asia/Kolkata';

// Patna — matches the coordinates from the app concept.
const CENTER = { lat: 25.5941, lon: 85.1376 };

interface Point {
  lat: number;
  lon: number;
  time: number;
  altitude: number;
  speed: number;
  accuracy: number;
}

/** Smooth wiggly loop whose circumference ≈ distanceKm. */
function makeTrack(startMs: number, distanceKm: number, speedKmh: number): Point[] {
  const speedMs = speedKmh / 3.6;
  const totalM = distanceKm * 1000;
  const intervalSec = 3;
  const stepM = speedMs * intervalSec;
  const count = Math.max(10, Math.round(totalM / stepM));
  const radiusM = totalM / (2 * Math.PI);
  const mPerDegLat = 111_320;
  const mPerDegLon = 111_320 * Math.cos((CENTER.lat * Math.PI) / 180);

  const pts: Point[] = [];
  for (let i = 0; i <= count; i++) {
    const angle = (i / count) * 2 * Math.PI - Math.PI / 2;
    const r = radiusM + Math.sin(angle * 4) * (radiusM * 0.12);
    const east = Math.cos(angle) * r;
    const north = Math.sin(angle) * r;
    const jitter = () => (Math.random() - 0.5) * 0.00002;

    pts.push({
      lat: CENTER.lat + north / mPerDegLat + jitter(),
      lon: CENTER.lon + east / mPerDegLon + jitter(),
      time: startMs + i * intervalSec * 1000,
      altitude: 53 + Math.sin(angle * 3) * 7 + (Math.random() - 0.5) * 1.5,
      speed: speedMs * (0.94 + Math.random() * 0.12),
      accuracy: 4 + Math.random() * 7,
    });
  }
  return pts;
}

/** Local midnight (in TZ) for `daysAgo` days before today, at `hour`:00. */
function localRunStart(daysAgo: number, hour: number): number {
  const now = new Date();
  const key = new Intl.DateTimeFormat('en-CA', {
    timeZone: TZ,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date(now.getTime() - daysAgo * 86_400_000));

  const asLocal = (k: string, h: number) => {
    // Build the UTC instant that reads as `k` `h`:00 in TZ (2-pass offset).
    const guess = Date.parse(`${k}T${String(h).padStart(2, '0')}:00:00Z`);
    const offsetAt = (t: number) => {
      const p: Record<string, string> = {};
      for (const part of new Intl.DateTimeFormat('en-US', {
        timeZone: TZ,
        hour12: false,
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
      }).formatToParts(new Date(t)))
        p[part.type] = part.value;
      return (
        Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour % 24, +p.minute, +p.second) - t
      );
    };
    const off = offsetAt(guess);
    const first = guess - off;
    const off2 = offsetAt(first);
    return off2 === off ? first : guess - off2;
  };

  return asLocal(key, hour);
}

/**
 * daysAgo → [distanceKm, paceSecPerKm]
 * Rest days (-15, -10, -4) are omitted. The last 7 days all have a run,
 * which is what produces the 7-day streak on the dashboard.
 */
const PLAN: Array<[number, number, number]> = [
  //  [daysAgo, km,   pace s/km]
  [0, 8.42, 372], // today
  [1, 6.73, 370],
  [2, 5.21, 376],
  [3, 6.4, 374],
  [4, 4.8, 378],
  [5, 8.9, 369],
  [6, 3.7, 373],
  [7, 7.1, 371],
  [8, 5.6, 375],
  [9, 6.9, 372],
  // 10 = rest
  [11, 10.2, 368],
  [12, 5.4, 377],
  // 13 = rest
  [14, 6.1, 373],
  [15, 7.8, 370],
  [16, 4.5, 380],
  [17, 9.3, 366],
  [18, 6.6, 374],
  // 19 = rest
  [20, 5.9, 375],
];

async function main() {
  console.log(`Seeding via ${API} (tz=${TZ})\n`);
  let ok = 0;

  for (const [daysAgo, km, paceSecPerKm] of PLAN) {
    const speedKmh = 3600 / paceSecPerKm;
    const startMs = localRunStart(daysAgo, 6 + (daysAgo % 3));
    const points = makeTrack(startMs, km, speedKmh);
    const durationSeconds = Math.round(points.length * 3);

    const res = await fetch(`${API}/runs`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        startedAt: new Date(startMs).toISOString(),
        endedAt: new Date(startMs + durationSeconds * 1000).toISOString(),
        durationSeconds,
        points,
      }),
    });

    if (!res.ok) {
      console.error(`  ✖ day -${daysAgo}: HTTP ${res.status} ${await res.text()}`);
      continue;
    }
    const { run } = (await res.json()) as { run: { distanceMeters: number; avgPaceSecPerKm: number } };
    ok += 1;
    console.log(
      `  ✔ day -${String(daysAgo).padStart(2)}  ${(run.distanceMeters / 1000).toFixed(2)} km  ` +
        `${Math.floor(run.avgPaceSecPerKm / 60)}:${String(run.avgPaceSecPerKm % 60).padStart(2, '0')} /km  ` +
        `(${points.length} pts)`,
    );
  }

  console.log(`\n✅ ${ok}/${PLAN.length} runs created`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
