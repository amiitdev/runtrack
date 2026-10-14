import { getAuth } from '@clerk/express';
import type { RequestHandler } from 'express';

/**
 * 401 unless a valid Clerk session token was verified by clerkMiddleware.
 * The verified user id is stashed on res.locals.userId for handlers.
 */
export const requireAuth: RequestHandler = (req, res, next) => {
  const userId = getAuth(req).userId;
  if (!userId) {
    res.status(401).json({ error: 'Unauthorized' });
    return;
  }
  res.locals.userId = userId;
  next();
};

/** Read the userId set by requireAuth (safe: every route using it runs requireAuth first). */
export function userId(res: { locals: Record<string, unknown> }): string {
  return res.locals.userId as string;
}
