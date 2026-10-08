import { and, desc, eq, gte, sql } from 'drizzle-orm';
import { db } from '../db/client.js';
import { runs, routePoints, runSplits, profile } from '../db/schema.js';

/* ------------------------------------------------------------------ */
/* Timezone helpers                                                     */
/* ------------------------------------------------------------------ */

/** Offset of `tz` from UTC for a given instant, in milliseconds. */
function tzOffsetMs(date: Date, tz: string): number {
  const dtf = new Intl.DateTimeFormat('en-US', {
    timeZone: tz,
    hour12: false,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
  const parts: Record<string, string> = {};
  for (const p of dtf.formatToParts(date)) parts[p.type] = p.value;
  const asUtc = Date.UTC(
    Number(parts.year),
    Number(parts.month) - 1,
    Number(parts.day),
    Number(parts.hour) % 24,
    Number(parts.minute),
    Number(parts.second),
  );
  return asUtc - date.getTime();
}

/** "2026-10-08" — the calendar day containing `date` as seen in `tz`. */
export function localDayKey(date: Date, tz: string): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: tz,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(date);
}

/**
 * UTC instant of local midnight for a calendar day key.
 *
 *   guess  = 2026-10-08T00:00Z
 *   offset = +05:30 (Asia/Kolkata)
 *   result = 2026-10-07T18:30Z  ==  2026-10-08 00:00 IST
 *
 * Two passes so the offset is sampled on both sides of a DST change.
 */
export function startOfLocalDayKey(dayKey: string, tz: string): Date {
  const utcGuess = new Date(`${dayKey}T00:00:00Z`);
  const first = new Date(utcGuess.getTime() - tzOffsetMs(utcGuess, tz));
  const secondOffset = tzOffsetMs(first, tz);
  const firstOffset = tzOffsetMs(utcGuess, tz);
  return secondOffset === firstOffset ? first : new Date(utcGuess.getTime() - secondOffset);
}

/** UTC instant of "00:00 in `tz` on the calendar day containing `date`". */
export function startOfLocalDay(date: Date, tz: string): Date {
  return startOfLocalDayKey(localDayKey(date, tz), tz);
}

function addDays(d: Date, n: number): Date {
  return new Date(d.getTime() + n * 86_400_000);
}

/**
 * Monday 00:00 local time of the week containing `date`.
 * We step back in *calendar-day-key* space (not raw milliseconds) so a DST
 * transition cannot land us at 23:00 of the previous week.
 */
export function startOfLocalWeek(date: Date, tz: string): Date {
  const key = localDayKey(date, tz);
  // Weekday of that calendar date. Noon UTC guarantees the date never rolls.
  const noon = new Date(`${key}T12:00:00Z`);
  const mondayOffset = (noon.getUTCDay() + 6) % 7; // Mon = 0 … Sun = 6
  const mondayKey = addDays(noon, -mondayOffset).toISOString().slice(0, 10);
  return startOfLocalDayKey(mondayKey, tz);
}

/** First instant of the local month containing `date`. */
export function startOfLocalMonth(date: Date, tz: string): Date {
  return startOfLocalDayKey(`${localDayKey(date, tz).slice(0, 7)}-01`, tz);
}

/* ------------------------------------------------------------------ */
/* Dashboard                                                            */
/* ------------------------------------------------------------------ */

export interface Dashboard {
  today: PeriodStats;
  week: PeriodStats;
  month: PeriodStats;
  allTime: PeriodStats;
  streakDays: number;
  totalRuns: number;
}

export interface PeriodStats {
  distanceMeters: number;
  durationSeconds: number;
  calories: number;
  runCount: number;
  avgPaceSecPerKm: number;
  avgSpeedKmh: number;
}

function summarize(rows: (typeof runs.$inferSelect)[]): PeriodStats {
  let distance = 0;
  let duration = 0;
  let calories = 0;
  for (const r of rows) {
    distance += r.distanceMeters;
    duration += r.durationSeconds;
    calories += r.calories;
  }
  const km = distance / 1000;
  return {
    distanceMeters: Math.round(distance),
    durationSeconds: Math.round(duration),
    calories: Math.round(calories),
    runCount: rows.length,
    avgPaceSecPerKm: km > 0 ? Math.round(duration / km) : 0,
    avgSpeedKmh:
      duration > 0 ? Math.round(((distance / 1000 / (duration / 3600)) + Number.EPSILON) * 100) / 100 : 0,
  };
}

async function runsSince(since: Date) {
  return db
    .select()
    .from(runs)
    .where(and(eq(runs.status, 'completed'), gte(runs.startedAt, since)))
    .orderBy(desc(runs.startedAt));
}

export async function getDashboard(tz: string): Promise<Dashboard> {
  const now = new Date();
  const startToday = startOfLocalDay(now, tz);
  const startWeek = startOfLocalWeek(now, tz);
  const startMonth = startOfLocalMonth(now, tz);

  // One query, three windows. A personal tracker has hundreds of runs,
  // not millions — slicing in JS keeps every timezone rule in one place.
  const allRows = await runsSince(new Date(0));

  const todayRows = allRows.filter((r) => r.startedAt >= startToday);
  const weekRows = allRows.filter((r) => r.startedAt >= startWeek);
  const monthRows = allRows.filter((r) => r.startedAt >= startMonth);

  return {
    today: summarize(todayRows),
    week: summarize(weekRows),
    month: summarize(monthRows),
    allTime: summarize(allRows),
    streakDays: computeStreak(allRows, now, tz),
    totalRuns: allRows.length,
  };
}

/* ------------------------------------------------------------------ */
/* Streak                                                               */
/* ------------------------------------------------------------------ */

const MIN_RUN_KM = 1; // a 300 m walk does not extend the streak

/**
 * Consecutive local days (ending today or yesterday) with at least
 * MIN_RUN_KM of running. If today's run has not happened yet we start
 * counting from yesterday, so the streak stays alive during the day.
 */
function computeStreak(rows: (typeof runs.$inferSelect)[], now: Date, tz: string): number {
  const kmByDay = new Map<string, number>();
  for (const r of rows) {
    const key = localDayKey(r.startedAt, tz);
    kmByDay.set(key, (kmByDay.get(key) ?? 0) + r.distanceMeters / 1000);
  }

  // Walk backwards in calendar-day-key space — no DST arithmetic involved.
  const prevKey = (key: string) =>
    addDays(new Date(`${key}T12:00:00Z`), -1).toISOString().slice(0, 10);

  const hasRun = (key: string) => (kmByDay.get(key) ?? 0) >= MIN_RUN_KM;

  let cursor = localDayKey(now, tz);
  if (!hasRun(cursor)) {
    cursor = prevKey(cursor); // today still in progress — do not break the streak
    if (!hasRun(cursor)) return 0;
  }

  let streak = 0;
  while (hasRun(cursor)) {
    streak += 1;
    cursor = prevKey(cursor);
  }
  return streak;
}

/* ------------------------------------------------------------------ */
/* History & detail                                                     */
/* ------------------------------------------------------------------ */

export async function listRuns(limit = 50, offset = 0) {
  return db
    .select()
    .from(runs)
    .where(eq(runs.status, 'completed'))
    .orderBy(desc(runs.startedAt))
    .limit(limit)
    .offset(offset);
}

export async function getRunDetail(id: string) {
  const [run] = await db.select().from(runs).where(eq(runs.id, id)).limit(1);
  if (!run) return null;

  const [points, splits] = await Promise.all([
    db
      .select()
      .from(routePoints)
      .where(eq(routePoints.runId, id))
      .orderBy(routePoints.seq),
    db.select().from(runSplits).where(eq(runSplits.runId, id)).orderBy(runSplits.index),
  ]);

  return { run, points, splits };
}

/* ------------------------------------------------------------------ */
/* Charts                                                               */
/* ------------------------------------------------------------------ */

export interface ChartBucket {
  /** Label shown under the bar (e.g. "Mon" or "2026-10-08"). */
  label: string;
  /** Start of the bucket in UTC, used as a stable key. */
  key: string;
  distanceMeters: number;
  durationSeconds: number;
  runCount: number;
}

const WEEKDAY = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

/**
 * Buckets completed runs into the last `days` local days.
 * Aggregation happens in JS on purpose: all timezone maths then lives in
 * one place (startOfLocalDay) instead of scattered through SQL.
 */
export async function dailyChart(days: number, tz: string): Promise<ChartBucket[]> {
  const now = new Date();
  const todayStart = startOfLocalDay(now, tz);
  const from = addDays(todayStart, -(days - 1));

  const rows = await db
    .select()
    .from(runs)
    .where(and(eq(runs.status, 'completed'), gte(runs.startedAt, from)))
    .orderBy(runs.startedAt);

  const buckets = new Map<string, ChartBucket>();
  for (let i = 0; i < days; i++) {
    const d = addDays(todayStart, -(days - 1 - i));
    const key = d.toISOString();
    const localDay = new Intl.DateTimeFormat('en-CA', { timeZone: tz }).format(d);
    const label =
      days <= 14
        ? WEEKDAY[new Date(`${localDay}T12:00:00Z`).getUTCDay()]
        : localDay.slice(5);
    buckets.set(key, { key, label, distanceMeters: 0, durationSeconds: 0, runCount: 0 });
  }

  for (const r of rows) {
    const bucketDay = startOfLocalDay(r.startedAt, tz);
    const b = buckets.get(bucketDay.toISOString());
    if (!b) continue;
    b.distanceMeters += r.distanceMeters;
    b.durationSeconds += r.durationSeconds;
    b.runCount += 1;
  }

  return [...buckets.values()];
}

/* ------------------------------------------------------------------ */
/* Personal records                                                     */
/* ------------------------------------------------------------------ */

export interface PersonalRecords {
  longestRunMeters: number;
  longestDurationSeconds: number;
  fastestKmPaceSec: number | null;
  bestWeekKm: number;
  bestMonthKm: number;
  totalRuns: number;
  totalDistanceMeters: number;
}

export async function getPersonalRecords(tz: string): Promise<PersonalRecords> {
  const allRows = await db
    .select()
    .from(runs)
    .where(eq(runs.status, 'completed'))
    .orderBy(runs.startedAt);

  // Fastest kilometre = lowest s/km among real full-kilometre splits.
  const [fastest] = await db
    .select({ pace: runSplits.paceSecPerKm })
    .from(runSplits)
    .where(sql`duration_seconds > 60 AND distance_meters >= 900`)
    .orderBy(runSplits.paceSecPerKm)
    .limit(1);

  // Best ISO-ish week (Mon–Sun local) and best local month.
  const weekTotals = new Map<string, number>();
  const monthTotals = new Map<string, number>();
  let totalDistance = 0;

  for (const r of allRows) {
    totalDistance += r.distanceMeters;
    const wk = startOfLocalWeek(r.startedAt, tz).toISOString().slice(0, 10);
    weekTotals.set(wk, (weekTotals.get(wk) ?? 0) + r.distanceMeters);
    const mo = startOfLocalMonth(r.startedAt, tz).toISOString().slice(0, 7);
    monthTotals.set(mo, (monthTotals.get(mo) ?? 0) + r.distanceMeters);
  }

  const longest = allRows.reduce((m, r) => Math.max(m, r.distanceMeters), 0);
  const longestDur = allRows.reduce((m, r) => Math.max(m, r.durationSeconds), 0);
  const bestWeek = Math.max(0, ...weekTotals.values());
  const bestMonth = Math.max(0, ...monthTotals.values());

  return {
    longestRunMeters: Math.round(longest),
    longestDurationSeconds: longestDur,
    fastestKmPaceSec: fastest?.pace ?? null,
    bestWeekKm: Math.round((bestWeek / 1000) * 10) / 10,
    bestMonthKm: Math.round((bestMonth / 1000) * 10) / 10,
    totalRuns: allRows.length,
    totalDistanceMeters: Math.round(totalDistance),
  };
}

/* ------------------------------------------------------------------ */
/* Profile                                                              */
/* ------------------------------------------------------------------ */

export async function getProfile() {
  const [row] = await db.select().from(profile).limit(1);
  if (row) return row;
  const [created] = await db.insert(profile).values({}).returning();
  return created;
}
