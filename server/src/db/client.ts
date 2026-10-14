import 'dotenv/config';
import { neon } from '@neondatabase/serverless';
import { drizzle } from 'drizzle-orm/neon-http';
import * as schema from './schema.js';

if (!process.env.DATABASE_URL) {
  throw new Error('Missing DATABASE_URL. Copy .env.example to .env and paste your Neon connection string.');
}

/**
 * neon-http speaks to Neon over HTTPS, so it never holds a socket open.
 * That makes it perfect for serverless/edge and for a plain Express server.
 */
const sql = neon(process.env.DATABASE_URL);

export const db = drizzle(sql, { schema });

export type Db = typeof db;
