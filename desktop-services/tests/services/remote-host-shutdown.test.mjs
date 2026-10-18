import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { PassThrough, Writable } from 'node:stream';
import { test } from 'node:test';
import { createHost } from '../../src/host.mjs';

test('closing Desktop stdin disables its gateway even when the host stays alive for cleanup', async t => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'trylo-host-remote-close-'));
  const previous = process.env.TRYLO_APP_DATA_DIR;
  process.env.TRYLO_APP_DATA_DIR = root;
  const input = new PassThrough();
  const output = new Writable({ write(_chunk, _encoding, done) { done(); } });
  const host = createHost({ stdin: input, stdout: output, stderr: output, autoExit: false });
  if (previous === undefined) delete process.env.TRYLO_APP_DATA_DIR;
  else process.env.TRYLO_APP_DATA_DIR = previous;
  t.after(async () => {
    input.destroy();
    await host.remote.disable();
    await host.learning.stopMaintenance();
    await host.learning.sessionFlush();
    await fs.rm(root, { recursive: true, force: true });
  });
  const reserve = net.createServer();
  await new Promise(resolve => reserve.listen(0, '127.0.0.1', resolve));
  const { port } = reserve.address();
  await new Promise(resolve => reserve.close(resolve));
  host.start();
  await host.remote.enable({ port, tunnelMode: 'off' });
  assert.equal(host.remote.status().running, true);
  input.end();
  const deadline = Date.now() + 1500;
  while (host.remote.status().running && Date.now() < deadline) await new Promise(resolve => setTimeout(resolve, 10));
  assert.equal(host.remote.status().running, false);
  await new Promise((resolve, reject) => { reserve.once('error', reject); reserve.listen(port, '127.0.0.1', resolve); });
  await new Promise(resolve => reserve.close(resolve));
});
