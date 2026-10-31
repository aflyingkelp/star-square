import fs from 'node:fs';
import path from 'node:path';
import { createEngine, root } from './headless.mjs';

const { engine, sandbox } = createEngine();
const levels = engine.levels();
const catalog = sandbox.STAR_SQUARE_DIFFICULTY_CATALOG;
const factory = Function('return ' + sandbox.SquareStarRating.runtimeSource())();
const changes = [];
const threshold = 1.25;

for (let rank = 1; rank <= 34; rank++) {
  const group = levels.map((def, index) => ({ def, result: catalog[index] }))
    .filter(({ def }) => def.rank === rank && !def.plus && !def.lnSeries && !def.generatedArchive);
  if (group.length !== 4 || group.some(item => !Number.isFinite(+item.result?.rawStars))) continue;
  const sorted = group.map(item => +item.result.rawStars).sort((a, b) => a - b);
  const target = (sorted[1] + sorted[2]) / 2;
  for (const item of group) {
    const before = +item.result.rawStars;
    if (Math.abs(before - target) <= threshold) continue;
    let best = { attacks: item.def.attacks, stars: before };
    for (const donor of group) {
      if (donor.def.id === item.def.id) continue;
      const attacks = donor.def.attacks;
      const candidate = await sandbox.SquareDifficulty.analyze({ ...item.def, attacks }, factory);
      const stars = +candidate.stars;
      if (Math.abs(stars - target) < Math.abs(best.stars - target)) best = { attacks, stars };
    }
    const improvement = Math.abs(before - target) - Math.abs(best.stars - target);
    if (improvement >= .5 && JSON.stringify(best.attacks) !== JSON.stringify(item.def.attacks)) {
      changes.push({ id: item.def.id, rank, skill: item.def.skill, from: item.def.attacks, to: best.attacks,
        before, after: best.stars, target, improvement: +improvement.toFixed(2) });
    }
  }
  console.log(`RANK ${rank}: ${changes.filter(item => item.rank === rank).length} pattern rebalance(s)`);
}
const output = path.join(root, 'tas-tools', 'normal-dan-balance.json');
fs.writeFileSync(output, JSON.stringify({ threshold, changes }, null, 2));
console.log(`Saved ${changes.length} normal Dan pattern rebalances to ${path.relative(root, output)}`);
