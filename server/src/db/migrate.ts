import 'dotenv/config';
import { migrate } from 'drizzle-orm/neon-http/migrator';
import { db } from './client.js';

/**
 * Applies every SQL file produced by `npm run db:generate`.
 * Neon keeps track of applied migrations in the `__drizzle_migrations` table,
 * so running this twice is safe — it is a no-op the second time.
 */
async function main() {
  console.log('⏳ Running migrations against Neon...');
  await migrate(db, { migrationsFolder: './drizzle' });
  console.log('✅ Migrations complete.');
  process.exit(0);
}

main().catch((err) => {
  console.error('❌ Migration failed:', err);
  process.exit(1);
});
