import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { test } from 'node:test';
import { createWorkspacePagePreview } from '../../src/tooling/workspace-page-preview.mjs';

test('approved workspace pages and static assets use a separate loopback origin', async t => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'trylo-page-preview-'));
  await fs.writeFile(path.join(root, 'index.html'), '<script src="app.js"></script>');
  await fs.writeFile(path.join(root, 'app.js'), 'document.body.dataset.ok="yes"');
  await fs.writeFile(path.join(root, '.secret.html'), 'private');
  await fs.writeFile(path.join(root, 'secret.txt'), 'private');
  const preview = createWorkspacePagePreview(root); t.after(() => preview.dispose());
  const url = await preview.open(pathToFileURL(path.join(root, 'index.html')).href);
  assert.equal(new URL(url).hostname, '127.0.0.1');
  assert.equal(await (await fetch(url)).text(), '<script src="app.js"></script>');
  assert.equal(await (await fetch(new URL('app.js', url))).text(), 'document.body.dataset.ok="yes"');
  assert.equal((await fetch(new URL('.secret.html', url))).status, 403);
  assert.equal((await fetch(new URL('secret.txt', url))).status, 403);
  assert.equal((await fetch(new URL('/index.html', url))).status, 404);
  assert.equal((await fetch(url, { method: 'POST' })).status, 405);
  await assert.rejects(preview.open(pathToFileURL(path.join(root, '..', 'outside.html')).href));
  await assert.rejects(preview.open('file://remote-host/share/index.html'));
  await assert.rejects(preview.open('javascript:alert(1)'));
});
test('a symlink cannot expose files outside the approved workspace', async t => {
  const outer = await fs.mkdtemp(path.join(os.tmpdir(), 'trylo-page-escape-'));
  const root = path.join(outer, 'workspace'), outside = path.join(outer, 'outside');
  await fs.mkdir(root); await fs.mkdir(outside); await fs.writeFile(path.join(outside, 'index.html'), 'private');
  await fs.symlink(outside, path.join(root, 'linked'), 'junction');
  const preview = createWorkspacePagePreview(root); t.after(() => preview.dispose());
  await assert.rejects(preview.open(pathToFileURL(path.join(root, 'linked', 'index.html')).href));
});
