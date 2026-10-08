import { Router } from 'express';
import { z } from 'zod';
import { eq, sql } from 'drizzle-orm';
import { db } from '../db/client.js';
import { runs, routePoints, runSplits } from '../db/schema.js';
import { computeRouteStats, computeSplits, type TrackPoint } from '../lib/geo.js';
import {
  avgSpeedKmh,
  caloriesFor,
  estimateSteps,
  paceSecPerKm,
} from '../lib/metrics.js';
import { getProfile, getRunDetail, listRuns } from '../lib/stats.js';

export const runsRouter = Router();

const pointSchema = z.object({
  lat: z.number().min(-90).max(90),
  lon: z.number().min(-180).max(180),
  time: z.number().int().positive(), // epoch ms
  altitude: z.number().nullable().optional(),
  speed: z.number().nullable().optional(),
  accuracy: z.number().nullable().optional(),
  /** Bumped by the phone every time the runner resumes from a PAUSE. */
  segment: z.number().int().min(0).max(10_000).optional(),
});

const createRunSchema = z.object({
  startedAt: z.string().datetime(),
  endedAt: z.string().datetime(),
  /** Moving time in seconds — does NOT include the paused periods. */
  durationSeconds: z.number().int().min(0).max(86_400),
  note: z.string().max(500).optional(),
  /** Actual step count when the phone's pedometer is available. */
  steps: z.number().int().min(0).optional(),
  points: z.array(pointSchema).min(2).max(20_000),
});

/**
 * POST /runs
 * The phone ships the raw GPS breadcrumb; the server is the single place
 * that derives distance / pace / calories / splits so every client agrees.
 */
runsRouter.post('/', async (req, res, next) => {
  try {
    const body = createRunSchema.parse(req.body);

    const points: TrackPoint[] = body.points.map((p) => ({
      lat: p.lat,
      lon: p.lon,
      time: p.time,
      altitude: p.altitude ?? null,
      speed: p.speed ?? null,
      accuracy: p.accuracy ?? null,
      segment: p.segment ?? 0,
    }));

    const route = computeRouteStats(points);
    const splits = computeSplits(points);

    const profile = await getProfile();
    const duration = body.durationSeconds;
    const distance = route.distanceMeters;

    const values = {
      status: 'completed' as const,
      startedAt: new Date(body.startedAt),
      endedAt: new Date(body.endedAt),
      durationSeconds: duration,
      distanceMeters: Math.round(distance * 100) / 100,
      avgSpeedKmh: avgSpeedKmh(distance, duration),
      maxSpeedKmh: Math.round(route.maxSpeedKmh * 100) / 100,
      avgPaceSecPerKm: paceSecPerKm(duration, distance),
      calories: caloriesFor(distance, duration, profile.weightKg),
      elevationGainMeters: Math.round(route.elevationGainMeters),
      steps: body.steps ?? estimateSteps(distance, profile.strideMeters),
      note: body.note ?? null,
    };

    const [run] = await db.insert(runs).values(values).returning();

    // Two extra statements. If either fails we delete the run again so the
    // dashboard never sees a run without its route (cascade cleans children).
    try {
      await db.insert(routePoints).values(
        points.map((p, i) => ({
          runId: run.id,
          seq: i,
          latitude: p.lat,
          longitude: p.lon,
          altitude: p.altitude,
          speed: p.speed,
          accuracy: p.accuracy,
          segment: p.segment,
          recordedAt: new Date(p.time),
        })),
      );

      if (splits.length > 0) {
        await db.insert(runSplits).values(
          splits.map((s) => ({
            runId: run.id,
            index: s.index,
            distanceMeters: s.distanceMeters,
            durationSeconds: s.durationSeconds,
            paceSecPerKm: s.paceSecPerKm,
            elevationGainMeters: s.elevationGainMeters,
          })),
        );
      }
    } catch (err) {
      await db.delete(runs).where(eq(runs.id, run.id));
      throw err;
    }

    res.status(201).json({ run, splits, pointsSaved: points.length });
  } catch (err) {
    next(err);
  }
});

/**
 * DELETE /runs — wipe every run (settings → "Clear history").
 * route_points and run_splits disappear through ON DELETE CASCADE.
 * The profile row is intentionally kept: it is a setting, not history.
 */
runsRouter.delete('/', async (_req, res, next) => {
  try {
    const deleted = await db.delete(runs).returning({ id: runs.id });
    res.json({ ok: true, deleted: deleted.length });
  } catch (err) {
    next(err);
  }
});

/** GET /runs?limit=50&offset=0 */
runsRouter.get('/', async (req, res, next) => {
  try {
    const limit = Math.min(Number(req.query.limit ?? 50) || 50, 200);
    const offset = Number(req.query.offset ?? 0) || 0;
    res.json(await listRuns(limit, offset));
  } catch (err) {
    next(err);
  }
});

/** GET /runs/:id — run + full GPS route + per-km splits. */
runsRouter.get('/:id', async (req, res, next) => {
  try {
    const detail = await getRunDetail(req.params.id);
    if (!detail) {
      res.status(404).json({ error: 'Run not found' });
      return;
    }
    res.json(detail);
  } catch (err) {
    next(err);
  }
});

/** DELETE /runs/:id — route_points / run_splits disappear via ON DELETE CASCADE. */
runsRouter.delete('/:id', async (req, res, next) => {
  try {
    const [deleted] = await db
      .delete(runs)
      .where(eq(runs.id, req.params.id))
      .returning({ id: runs.id });
    if (!deleted) {
      res.status(404).json({ error: 'Run not found' });
      return;
    }
    res.json({ ok: true, id: deleted.id });
  } catch (err) {
    next(err);
  }
});

/** Lightweight existence probe used by the health check. */
export async function runsCount(): Promise<number> {
  const [row] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(runs);
  return row?.count ?? 0;
}
