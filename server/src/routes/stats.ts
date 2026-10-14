import { Router } from 'express';
import { z } from 'zod';
import {
  getDashboard,
  getPersonalRecords,
  dailyChart,
} from '../lib/stats.js';

export const statsRouter = Router();

const tzQuery = z.object({
  tz: z.string().min(1).max(64).default('UTC'),
});

/** GET /stats/dashboard?tz=Asia/Kolkata */
statsRouter.get('/dashboard', async (req, res, next) => {
  try {
    const { tz } = tzQuery.parse(req.query);
    res.json(await getDashboard(tz));
  } catch (err) {
    next(err);
  }
});

/** GET /stats/chart?days=7&tz=Asia/Kolkata */
statsRouter.get('/chart', async (req, res, next) => {
  try {
    const days = Math.min(Math.max(Number(req.query.days ?? 7) || 7, 1), 365);
    const { tz } = tzQuery.parse(req.query);
    res.json(await dailyChart(days, tz));
  } catch (err) {
    next(err);
  }
});

/** GET /stats/records?tz=Asia/Kolkata */
statsRouter.get('/records', async (req, res, next) => {
  try {
    const { tz } = tzQuery.parse(req.query);
    res.json(await getPersonalRecords(tz));
  } catch (err) {
    next(err);
  }
});
