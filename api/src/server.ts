import 'dotenv/config';
import { app } from './app.js';

const PORT = Number(process.env.PORT ?? 4000);

app.listen(PORT, () => {
  console.log(`\n🏃 RunTrack API listening on http://localhost:${PORT}`);
  console.log(`   health   GET  /health`);
  console.log(`   runs     POST /runs, GET /runs, GET /runs/:id`);
  console.log(`   stats    GET  /stats/dashboard | /stats/chart | /stats/records`);
  console.log(`   profile  GET  /profile, PUT /profile\n`);
});
