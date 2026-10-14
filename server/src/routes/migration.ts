import { Router } from 'express';
import { eq, isNull, sql } from 'drizzle-orm';
import { db } from '../db/client.js';
import { runs, profile } from '../db/schema.js';
import { requireAuth, userId } from '../lib/auth.js';

export const migrationRouter = Router();

/**
 * GET /migration/status — how many pre-auth rows are still unowned.
 * The mobile app uses this to decide whether to show the claim prompt
 * after the user's very first sign-in.
 */
migrationRouter.get('/status', requireAuth, async (_req, res, next) => {
  try {
    const [runRow] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(runs)
      .where(isNull(runs.userId));
    const [profileRow] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(profile)
      .where(isNull(profile.userId));
    res.json({ unownedRuns: runRow?.count ?? 0, unownedProfile: profileRow?.count ?? 0 });
  } catch (err) {
    next(err);
  }
});

/**
 * POST /migration/claim — assign every unowned row to the caller.
 * Idempotent: a second call finds nothing to claim and reports 0.
 *
 * Profile handling: if the caller already has an auto-created default row,
 * we copy the legacy (unowned) row's settings over it, then delete the
 * legacy row. If they have no row yet, we simply stamp the caller's id on
 * the legacy row so their old weight / stride / name survive.
 */
migrationRouter.post('/claim', requireAuth, async (_req, res, next) => {
  try {
    const uid = userId(res);

    const claimedRuns = await db
      .update(runs)
      .set({ userId: uid })
      .where(isNull(runs.userId))
      .returning({ id: runs.id });

    let claimedProfile = 0;
    const [unowned] = await db
      .select()
      .from(profile)
      .where(isNull(profile.userId))
      .limit(1);
    if (unowned) {
      const [owned] = await db
        .select()
        .from(profile)
        .where(eq(profile.userId, uid))
        .limit(1);
      if (owned) {
        await db
          .update(profile)
          .set({
            displayName: unowned.displayName,
            weightKg: unowned.weightKg,
            strideMeters: unowned.strideMeters,
          })
          .where(eq(profile.id, owned.id));
        await db.delete(profile).where(eq(profile.id, unowned.id));
      } else {
        await db.update(profile).set({ userId: uid }).where(eq(profile.id, unowned.id));
      }
      claimedProfile = 1;
    }

    res.json({ claimedRuns: claimedRuns.length, claimedProfile });
  } catch (err) {
    next(err);
  }
});
