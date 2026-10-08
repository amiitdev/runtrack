import {
  pgTable,
  pgEnum,
  uuid,
  text,
  integer,
  doublePrecision,
  timestamp,
  date,
  bigserial,
  index,
  uniqueIndex,
} from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';

/**
 * Run status lifecycle:
 *   active   -> currently being tracked (rare: only if app dies mid-run)
 *   completed-> user pressed STOP and saved
 *   discarded-> user pressed STOP and chose "delete"
 */
export const runStatus = pgEnum('run_status', ['active', 'completed', 'discarded']);

/**
 * Single-row table holding the runner's profile.
 * weight_kg is required to turn distance + time into calories (MET formula).
 */
export const profile = pgTable('profile', {
  id: uuid('id').default(sql`gen_random_uuid()`).primaryKey(),
  displayName: text('display_name').notNull().default('Runner'),
  weightKg: doublePrecision('weight_kg').notNull().default(70),
  strideMeters: doublePrecision('stride_meters').notNull().default(0.78),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

/**
 * One row per finished run. Holds the *aggregated* numbers so the
 * dashboard can read a single table without touching route_points.
 */
export const runs = pgTable(
  'runs',
  {
    id: uuid('id').default(sql`gen_random_uuid()`).primaryKey(),
    status: runStatus('status').notNull().default('completed'),

    startedAt: timestamp('started_at', { withTimezone: true }).notNull(),
    endedAt: timestamp('ended_at', { withTimezone: true }).notNull(),

    /** Pure moving time (elapsed minus paused). */
    durationSeconds: integer('duration_seconds').notNull().default(0),

    distanceMeters: doublePrecision('distance_meters').notNull().default(0),
    avgSpeedKmh: doublePrecision('avg_speed_kmh').notNull().default(0),
    maxSpeedKmh: doublePrecision('max_speed_kmh').notNull().default(0),
    /** Seconds to cover 1 km — easier to average than min/km strings. */
    avgPaceSecPerKm: integer('avg_pace_sec_per_km').notNull().default(0),

    calories: doublePrecision('calories').notNull().default(0),
    elevationGainMeters: doublePrecision('elevation_gain_meters').notNull().default(0),
    steps: integer('steps').notNull().default(0),

    note: text('note'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('runs_started_at_idx').on(t.startedAt),
    index('runs_status_idx').on(t.status),
  ],
);

/**
 * The raw GPS breadcrumb trail. This is the source of truth:
 * everything else on the runs row is derived from these points.
 * We keep them so we can re-draw the route and recompute stats later.
 */
export const routePoints = pgTable(
  'route_points',
  {
    id: bigserial('id', { mode: 'number' }).primaryKey(),
    runId: uuid('run_id')
      .notNull()
      .references(() => runs.id, { onDelete: 'cascade' }),

    /** Order of the point inside the run (0, 1, 2, ...). */
    seq: integer('seq').notNull(),

    /**
     * Moving segment. Resuming after a PAUSE starts a new segment, so the
     * distance walked while paused (or the jump back to the car) is never
     * added to the total. Distance is only ever summed WITHIN a segment.
     */
    segment: integer('segment').notNull().default(0),

    latitude: doublePrecision('latitude').notNull(),
    longitude: doublePrecision('longitude').notNull(),
    altitude: doublePrecision('altitude'),
    /** Meters/second straight from the GPS chip (0 when signal is weak). */
    speed: doublePrecision('speed'),
    /** Horizontal accuracy in meters — we reject points worse than 30 m. */
    accuracy: doublePrecision('accuracy'),

    recordedAt: timestamp('recorded_at', { withTimezone: true }).notNull(),
  },
  (t) => [
    index('route_points_run_seq_idx').on(t.runId, t.seq),
    uniqueIndex('route_points_run_seq_uq').on(t.runId, t.seq),
  ],
);

/**
 * Per-kilometer splits, computed once when the run is saved.
 * Having them pre-drawn makes "pace chart" and "fastest 1 km" trivial
 * instead of re-slicing thousands of GPS points on every dashboard load.
 */
export const runSplits = pgTable(
  'run_splits',
  {
    id: bigserial('id', { mode: 'number' }).primaryKey(),
    runId: uuid('run_id')
      .notNull()
      .references(() => runs.id, { onDelete: 'cascade' }),

    /** 1-based kilometer number (1, 2, 3, ...). */
    index: integer('index').notNull(),
    distanceMeters: doublePrecision('distance_meters').notNull().default(1000),
    durationSeconds: integer('duration_seconds').notNull().default(0),
    paceSecPerKm: integer('pace_sec_per_km').notNull().default(0),
    elevationGainMeters: doublePrecision('elevation_gain_meters').notNull().default(0),
  },
  (t) => [index('run_splits_run_idx').on(t.runId, t.index)],
);

/**
 * Optional daily goal, used by the streak system and the dashboard ring.
 */
export const goals = pgTable('goals', {
  id: uuid('id').default(sql`gen_random_uuid()`).primaryKey(),
  /** Calendar day this goal applies to (date, not timestamp). */
  day: date('day').notNull(),
  targetKm: doublePrecision('target_km').notNull().default(5),
});

export type Profile = typeof profile.$inferSelect;
export type Run = typeof runs.$inferSelect;
export type NewRun = typeof runs.$inferInsert;
export type RoutePoint = typeof routePoints.$inferSelect;
export type NewRoutePoint = typeof routePoints.$inferInsert;
export type RunSplit = typeof runSplits.$inferSelect;
export type NewRunSplit = typeof runSplits.$inferInsert;
export type Goal = typeof goals.$inferSelect;
