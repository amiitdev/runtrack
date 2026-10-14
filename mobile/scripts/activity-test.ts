import { classifyActivity } from '../src/lib/activity';
const cases: Array<[string, number, string]> = [
  ['phone on bed', 0.14, 'still'],
  ['your park walk (4.32 km/h)', 1.2, 'walk'],
  ['brisk walk (5.5 km/h)', 1.53, 'walk'],
  ['slow jog (7 km/h)', 1.94, 'jog'],
  ['your park run (9.9 km/h)', 2.74, 'run'],
  ['steady run (11.2 km/h)', 3.1, 'run'],
  ['sprint (14 km/h)', 3.9, 'sprint'],
];
let bad = 0;
for (const [name, mps, want] of cases) {
  const got = classifyActivity(mps);
  const ok = got === want;
  if (!ok) bad++;
  console.log(`  ${ok ? '✔' : '✘'} ${name.padEnd(30)} ${mps.toFixed(2)} m/s → ${got} (want ${want})`);
}
console.log(bad === 0 ? '\n✅ all activity bands correct' : `\n❌ ${bad} wrong`);
process.exit(bad ? 1 : 0);
