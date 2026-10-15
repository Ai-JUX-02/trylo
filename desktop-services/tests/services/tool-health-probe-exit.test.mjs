import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import { probeVersion } from '../../src/tooling/tool-health-service.mjs';

for (const [name, source, expected] of [
  ['successful version process', 'console.log("Version 1.2.3")', 'Version 1.2.3'],
  ['failed process that still prints a version', 'console.log("Version 1.2.3"); process.exitCode = 1', null],
  ['oversized output from a failed process', 'console.log("Version 1.2.3" + "x".repeat(5000)); process.exitCode = 1', null],
]) test(`version probe validates ${name}`, async (t) => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'trylo-probe-exit-'));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  const script = path.join(root, 'version.cjs');
  await fs.writeFile(script, source);
  assert.equal(await probeVersion(script, 3000, 'node'), expected);
});
