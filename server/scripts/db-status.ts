/** Read-only health check for the live Neon database. */
import 'dotenv/config';
import { neon } from '@neondatabase/serverless';

const sql = neon(process.env.DATABASE_URL!);

const [cols] = await sql`
  SELECT column_name, is_nullable FROM information_schema.columns
  WHERE table_name = 'runs' AND column_name = 'user_id'`;
console.log('runs.user_id column :', cols ? `present (nullable=${cols.is_nullable})` : 'MISSING');

const [runs] = await sql`
  SELECT count(*)::int AS total, count(user_id)::int AS owned FROM runs`;
console.log('runs                :', `${runs.total} total, ${runs.owned} owned, ${runs.total - runs.owned} unowned (legacy)`);

const [agg] = await sql`
  SELECT count(*)::int AS runs, coalesce(round(sum(distance_meters))::int, 0) AS metres,
         to_char(min(started_at), 'YYYY-MM-DD') AS oldest
  FROM runs`;
console.log('distance on file    :', `${(agg.metres / 1000).toFixed(2)} km over ${agg.runs} runs since ${agg.oldest}`);

const [pts] = await sql`SELECT count(*)::int AS n FROM route_points`;
console.log('route_points        :', pts.n);

const [prof] = await sql`SELECT count(*)::int AS total, count(user_id)::int AS owned FROM profile`;
console.log('profile             :', `${prof.total} rows, ${prof.owned} owned`);
