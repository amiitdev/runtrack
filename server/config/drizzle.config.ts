import { defineConfig } from 'drizzle-kit';

/**
 * drizzle-kit reads this file to know how to talk to your database when you run:
 *   npm run db:generate   -> print SQL migrations from schema.ts
 *   npm run db:studio     -> open the browser-based DB browser
 *
 * dotenv/config inside drizzle-kit is triggered by loading .env below.
 */
export default defineConfig({
  dialect: 'postgresql',
  schema: './src/db/schema.ts',
  out: './drizzle',
  dbCredentials: {
    url: process.env.DATABASE_URL!,
  },
  strict: true,
  verbose: true,
});
