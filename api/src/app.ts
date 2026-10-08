import 'dotenv/config';
import express, { type NextFunction, type Request, type Response } from 'express';
import cors from 'cors';
import { ZodError } from 'zod';
import { runsRouter } from './routes/runs.js';
import { statsRouter } from './routes/stats.js';
import { profileRouter } from './routes/profile.js';
import { runsCount } from './routes/runs.js';

export const app = express();

const allowedOrigins = (process.env.CORS_ORIGIN ?? '*')
  .split(',')
  .map((s) => s.trim())
  .filter(Boolean);

app.use(cors({ origin: allowedOrigins.includes('*') ? true : allowedOrigins }));
app.use(express.json({ limit: '10mb' }));

/** Tiny request log — handy while learning the API. */
app.use((req, _res, next) => {
  console.log(`${new Date().toISOString()}  ${req.method} ${req.originalUrl}`);
  next();
});

app.get('/health', async (_req, res) => {
  res.json({
    ok: true,
    service: 'runtrack-api',
    uptimeSeconds: Math.round(process.uptime()),
    runs: await runsCount(),
  });
});

app.use('/runs', runsRouter);
app.use('/stats', statsRouter);
app.use('/profile', profileRouter);

app.use((_req, res) => {
  res.status(404).json({ error: 'Not found' });
});

/** Central error handler — zod problems become 400, everything else 500. */
app.use((err: unknown, _req: Request, res: Response, _next: NextFunction) => {
  if (err instanceof ZodError) {
    res.status(400).json({ error: 'Validation failed', issues: err.issues });
    return;
  }
  console.error('Unhandled error:', err);
  res.status(500).json({ error: 'Internal server error' });
});

export default app;
