// Mutation verification uses isolated service copies, never edits production source.
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import assert from 'node:assert/strict';
const root = path.resolve(fileURLToPath(new URL('../', import.meta.url)));
const output = path.join(root, '../desktop/spike-results/native-browser-2026-10-13');
const scratch = await fs.mkdtemp(path.join(root, '.native-regression-'));
const source = await fs.readFile(path.join(root, 'src/tooling/native-browser-service.mjs'), 'utf8');
const test = await fs.readFile(path.join(root, 'tests/services/native-browser-service.test.mjs'), 'utf8');
const proof = { kind: 'isolated mutation checks', checks: [] };
try {
  const variants = [
    ['baseline', source, 0],
    ['user-hold-bypassed', source.replace('if (session.held || response.destroyed', 'if (false || response.destroyed'), 1],
    ['invisible-CDP-tab-restored', source.replace("const intercept = ['Target.createTarget', 'Target.closeTarget'", "const intercept = ['Target.closeTarget'"), 1],
  ];
  for (const [name, mutated, expected] of variants) {
    const file = path.join(scratch, `${name}.mjs`), testFile = path.join(scratch, `${name}.test.mjs`);
    await fs.writeFile(file, mutated); await fs.writeFile(testFile, test.replace('../../src/tooling/native-browser-service.mjs', `./${name}.mjs`));
    const run = spawnSync(process.execPath, ['--test', '--test-timeout=10000', testFile], { encoding: 'utf8', windowsHide: true, timeout: 20000 });
    assert.equal(run.status, expected, `${name}: ${run.stdout}\n${run.stderr}`);
    proof.checks.push({ name, expectedExit: expected, actualExit: run.status, output: run.stdout + run.stderr });
  }
  proof.result = 'pass';
} catch (error) { proof.result = 'fail'; proof.error = String(error.stack ?? error); process.exitCode = 1; }
finally {
  await fs.mkdir(output, { recursive: true }); await fs.writeFile(path.join(output, 'regression-mutations.json'), JSON.stringify(proof, null, 2));
  const resolved = path.resolve(scratch); if (resolved.startsWith(root + path.sep) && path.basename(resolved).startsWith('.native-regression-')) await fs.rm(resolved, { recursive: true, force: true });
  console.log(JSON.stringify({ result: proof.result, checks: proof.checks.length, error: proof.error }));
}
