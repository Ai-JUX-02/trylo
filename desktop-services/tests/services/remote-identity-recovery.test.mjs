import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import { createIdentityStore, readIdentityFile } from '../../src/remote/identity.mjs';

async function fixture(t) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'trylo-identity-recovery-'));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  return root;
}

test('concurrent identity stores return one persisted pairing token', async (t) => {
  const root = await fixture(t);
  let generated = 0;
  const make = () => createIdentityStore({ appDataDir: root, generateToken: () => `token-${'x'.repeat(32)}-${++generated}` });
  const first = make(), second = make();
  const writeFile = fs.writeFile;
  let entered, release;
  const writing = new Promise(resolve => { entered = resolve; });
  const blocked = new Promise(resolve => { release = resolve; });
  t.mock.method(fs, 'writeFile', async (...args) => {
    if (String(args[0]).endsWith('.tmp')) { entered(); await blocked; }
    return writeFile(...args);
  });
  const a = first.loadOrCreate();
  await writing;
  const b = second.loadOrCreate();
  // Let the second caller reach the read/write race in the unfixed code.
  await new Promise(resolve => setTimeout(resolve, 20));
  release();
  const results = await Promise.allSettled([a, b]);
  assert.deepEqual(results.map(result => result.status), ['fulfilled', 'fulfilled']);
  assert.equal(results[0].value.pairingToken, results[1].value.pairingToken);
  assert.equal((await readIdentityFile(first.filePath)).pairingToken, results[0].value.pairingToken);
  assert.equal(generated, 1);
  assert.deepEqual(await fs.readdir(path.dirname(first.filePath)), ['identity.json']);
});

test('identity read I/O failure never regenerates or overwrites a paired token', async (t) => {
  const root = await fixture(t);
  const store = createIdentityStore({ appDataDir: root });
  await store.loadOrCreate();
  const saved = await fs.readFile(store.filePath, 'utf8');
  const readFile = fs.readFile;
  t.mock.method(fs, 'readFile', async (...args) => {
    if (args[0] === store.filePath) throw Object.assign(new Error('injected identity read failure'), { code: 'EACCES' });
    return readFile(...args);
  });
  await assert.rejects(store.loadOrCreate(), /injected identity read failure/);
  assert.equal(await readFile(store.filePath, 'utf8'), saved);
});

test('failed identity replacement preserves the old file and removes its temp', async (t) => {
  const root = await fixture(t);
  const store = createIdentityStore({ appDataDir: root });
  await fs.mkdir(path.dirname(store.filePath), { recursive: true });
  await fs.writeFile(store.filePath, '{corrupt but recoverable backup');
  t.mock.method(fs, 'rename', async () => {
    throw Object.assign(new Error('injected identity replacement failure'), { code: 'EACCES' });
  });
  await assert.rejects(store.loadOrCreate(), /injected identity replacement failure/);
  assert.equal(await fs.readFile(store.filePath, 'utf8'), '{corrupt but recoverable backup');
  assert.deepEqual(await fs.readdir(path.dirname(store.filePath)), ['identity.json']);
});

test('legacy identity import refuses an unconfigured destination before doing I/O', async (t) => {
  let reads = 0;
  t.mock.method(fs, 'readFile', async () => { ++reads; throw new Error('unexpected read'); });
  const store = createIdentityStore({ appDataDir: '' });
  await assert.rejects(store.importLegacy({ legacyDir: 'legacy' }), /app data dir is not configured/);
  assert.equal(reads, 0);
});

test('a failed identity write does not poison another queued load', async (t) => {
  const root = await fixture(t);
  const store = createIdentityStore({ appDataDir: root });
  const writeFile = fs.writeFile;
  let fail = true;
  t.mock.method(fs, 'writeFile', async (...args) => {
    if (fail) { fail = false; throw new Error('injected first identity write failure'); }
    return writeFile(...args);
  });
  const results = await Promise.allSettled([store.loadOrCreate(), store.loadOrCreate()]);
  assert.deepEqual(results.map(result => result.status), ['rejected', 'fulfilled']);
  assert.match(results[0].reason.message, /injected first identity write failure/);
  assert.equal((await readIdentityFile(store.filePath)).pairingToken, results[1].value.pairingToken);
});

test('legacy import and load share the same identity transaction', async (t) => {
  const root = await fixture(t);
  const legacyDir = await fixture(t);
  const token = 'legacy-'.padEnd(43, 'x');
  await fs.writeFile(path.join(legacyDir, 'remote-identity.json'), JSON.stringify({ pairingToken: token, deviceSeed: 'OLD-PC' }));
  const first = createIdentityStore({ appDataDir: root });
  const second = createIdentityStore({ appDataDir: root });
  const [imported, loaded] = await Promise.all([first.importLegacy({ legacyDir }), second.loadOrCreate()]);
  assert.equal(imported.imported, true);
  assert.equal(loaded.pairingToken, token);
  assert.equal((await readIdentityFile(first.filePath)).pairingToken, token);
});
