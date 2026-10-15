import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import { createToolProfileService } from '../../src/tooling/tool-profile-service.mjs';

test('concurrent profile resolutions publish the same complete config without sharing temporary files', { timeout: 5000 }, async (t) => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'trylo-profile-race-'));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  const makeService = () => createToolProfileService({
    storageRoot: root,
    catalog: { get: () => undefined, list: () => [] },
  });
  const writeFile = fs.writeFile;
  let completedWrites = 0;
  let release;
  const bothWritten = new Promise(resolve => { release = resolve; });
  t.mock.method(fs, 'writeFile', async (file, ...args) => {
    await writeFile(file, ...args);
    if (String(file).includes('mcp.json.') && String(file).endsWith('.tmp')) {
      if (++completedWrites === 2) release();
      await bothWritten;
    }
  });
  const results = await Promise.all([makeService().resolve(), makeService().resolve()]);
  assert.deepEqual(results.map(result => result.ok), [true, true], JSON.stringify(results));
  assert.equal(results[0].mcpConfigPath, results[1].mcpConfigPath);
  assert.deepEqual(JSON.parse(await fs.readFile(results[0].mcpConfigPath, 'utf8')), { mcpServers: {} });
  const files = await fs.readdir(path.dirname(results[0].mcpConfigPath));
  assert.deepEqual(files, ['mcp.json']);
});
