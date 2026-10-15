import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import { resolveNpmCommand } from '../../src/tooling/tool-package-manager.mjs';

for (const [layout, nodePath, npmPath] of [
  ['Windows', 'node.exe', 'node_modules/npm/bin/npm-cli.js'],
  ['Unix', 'bin/node', 'lib/node_modules/npm/bin/npm-cli.js'],
]) test(`npm resolver supports the ${layout} Node installation layout`, (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'trylo-npm-layout-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const executable = path.join(root, nodePath);
  const npm = path.join(root, npmPath);
  fs.mkdirSync(path.dirname(npm), { recursive: true });
  fs.writeFileSync(npm, '// npm entry fixture');
  assert.deepEqual(resolveNpmCommand(executable), { command: executable, args: [npm] });
});

test('npm resolver reports an installation without npm as unavailable', (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'trylo-npm-absent-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  assert.equal(resolveNpmCommand(path.join(root, 'bin', 'node')), null);
});
