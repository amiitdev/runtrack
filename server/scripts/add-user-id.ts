/**
 * Idempotent schema update for Clerk user scoping.
 * Adds nullable user_id columns so pre-auth rows can be claimed on
 * first sign-in. Safe to run repeatedly.
 *
 * Usage: npx tsx scripts/add-user-id.ts
 */
import 'dotenv/config';
import { neon } from '@neondatabase/serverless';

const url = process.env.DATABASE_URL;
if (!url) throw new Error('Missing DATABASE_URL');

const sql = neon(url);

const statements = [
  `ALTER TABLE runs ADD COLUMN IF NOT EXISTS user_id text`,
  `CREATE INDEX IF NOT EXISTS runs_user_id_idx ON runs (user_id)`,
  `ALTER TABLE profile ADD COLUMN IF NOT EXISTS user_id text`,
  `CREATE UNIQUE INDEX IF NOT EXISTS profile_user_id_idx ON profile (user_id)`,
  `ALTER TABLE goals ADD COLUMN IF NOT EXISTS user_id text`,
];

async function main() {
  for (const statement of statements) {
    process.stdout.write(`> ${statement}\n`);
    await sql.query(statement);
  }
  console.log('done');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
