import { Router } from 'express';
import { z } from 'zod';
import { eq } from 'drizzle-orm';
import { db } from '../db/client.js';
import { profile } from '../db/schema.js';
import { getProfile } from '../lib/stats.js';

export const profileRouter = Router();

const updateSchema = z.object({
  displayName: z.string().min(1).max(60).optional(),
  weightKg: z.number().min(25).max(300).optional(),
  strideMeters: z.number().min(0.4).max(1.5).optional(),
});

/** GET /profile — creates the default row on first call. */
profileRouter.get('/', async (_req, res, next) => {
  try {
    res.json(await getProfile());
  } catch (err) {
    next(err);
  }
});

/** PUT /profile */
profileRouter.put('/', async (req, res, next) => {
  try {
    const patch = updateSchema.parse(req.body);
    const existing = await getProfile();
    const [updated] = await db
      .update(profile)
      .set(patch)
      .where(eq(profile.id, existing.id))
      .returning();
    res.json(updated);
  } catch (err) {
    next(err);
  }
});
