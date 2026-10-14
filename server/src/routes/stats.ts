import { Router } from 'express';
import { z } from 'zod';
import { getDashboard, getPersonalRecords, dailyChart } from '../lib/stats.js';
import { requireAuth, userId } from '../lib/auth.js';

export const statsRouter = Router();

const tzQuery = z.object({
  tz: z.string().min(1).max(64).default('UTC'),
});

/** GET /stats/dashboard?tz=Asia/Kolkata */
statsRouter.get('/dashboard', requireAuth, async (req, res, next) => {
  try {
    const { tz } = tzQuery.parse(req.query);
    res.json(await getDashboard(userId(res), tz));
  } catch (err) {
    next(err);
  }
});

/** GET /stats/chart?days=7&tz=Asia/Kolkata */
statsRouter.get('/chart', requireAuth, async (req, res, next) => {
  try {
    const days = Math.min(Math.max(Number(req.query.days ?? 7) || 7, 1), 365);
    const { tz } = tzQuery.parse(req.query);
    res.json(await dailyChart(userId(res), days, tz));
  } catch (err) {
    next(err);
  }
});

/** GET /stats/records?tz=Asia/Kolkata */
statsRouter.get('/records', requireAuth, async (req, res, next) => {
  try {
    const { tz } = tzQuery.parse(req.query);
    res.json(await getPersonalRecords(userId(res), tz));
  } catch (err) {
    next(err);
  }
});
