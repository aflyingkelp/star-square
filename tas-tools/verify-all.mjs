import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { createEngine, root } from './headless.mjs';

const libraryPath = path.join(root, 'tas-library.json');
const libraryBytes = fs.readFileSync(libraryPath, 'utf8');
const library = JSON.parse(libraryBytes);
const levelIds = createEngine().engine.levels().map(level => level.id);
const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'star-square-tas-verify-'));
const reports = [];
const batchSize = 40;

try {
  for (let start = 0; start < levelIds.length; start += batchSize) {
    const selected = levelIds.slice(start, start + batchSize);
    const reportPath = path.join(tempDir, `${start}.json`);
    const result = spawnSync(process.execPath, [path.join(root, 'tas-tools', 'verify.mjs'), ...selected], {
      cwd: root, stdio: 'inherit', env: { ...process.env, STAR_SQUARE_TAS_REPORT: reportPath }
    });
    if (result.error) throw result.error;
    if (result.status !== 0) throw new Error(`TAS verification batch ${start / batchSize + 1} failed (${result.status})`);
    const report = JSON.parse(fs.readFileSync(reportPath, 'utf8'));
    reports.push(...report.levels);
    console.log(`PASS batch ${start / batchSize + 1}/${Math.ceil(levelIds.length / batchSize)} (${reports.length}/${levelIds.length})`);
  }
  const report = {
    version: 1, rulesHash: library.rulesHash,
    librarySHA256: createHash('sha256').update(libraryBytes).digest('hex'),
    levelCount: levelIds.length, verifiedCount: reports.length, allPassed: reports.length === levelIds.length,
    policy: library.policy,
    checks: ['Fresh game instance per tape', 'Actual game physics and collision rules', 'Earned loadout before the level rank',
      'No bomb or developer-mode inputs', 'Zero recorded hits', 'Expected clear tick and state checksum',
      'Omega 473 exact 240 Hz inputs', 'Omega corrupted timing cannot clear', 'Persistent player save unchanged'],
    levels: reports
  };
  fs.writeFileSync(path.join(root, 'tas-verification.json'), JSON.stringify(report, null, 2));
  console.log(`ALL ${reports.length} CATALOG LEVELS VERIFIED.`);
} finally {
  fs.rmSync(tempDir, { recursive: true, force: true });
}
