import assert from 'node:assert/strict';
import http from 'node:http';
import net from 'node:net';
import { createRequire } from 'node:module';
import { test } from 'node:test';
import { createRemoteAdapter } from '../../src/remote/gateway-adapter.mjs';

const require = createRequire(import.meta.url);
const { createRemoteGateway } = require('../../vendor/legacy/remote-gateway/index.js');
const oldToken = 'old-desktop-token-'.padEnd(43, 'x');
const newToken = 'new-desktop-token-'.padEnd(43, 'y');
const tick = ms => new Promise(resolve => setTimeout(resolve, ms));

async function freePort() {
  const server = http.createServer();
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const { port } = server.address();
  await new Promise(resolve => server.close(resolve));
  return port;
}

async function fixture(t) {
  const identity = { loadOrCreate: async () => ({ pairingToken: newToken, deviceSeed: 'new-pc' }) };
  const tunnelCalls = [];
  const tunnel = {
    start: async options => { tunnelCalls.push(options); return { publicUrl: `https://desktop-${options.port}.example.invalid`, running: true }; },
    stop: async () => {},
  };
  const adapter = createRemoteAdapter({ identity, tunnel });
  t.after(() => adapter.disable());
  return { adapter, tunnelCalls };
}

test('Desktop uses its own port and tunnel when its preferred port is occupied', async t => {
  const { adapter, tunnelCalls } = await fixture(t);
  let handedOff = 0;
  const old = createRemoteGateway({ port: await freePort(), authToken: oldToken, handlers: { handoff: async () => {
    ++handedOff;
    return { releasing: true };
  } } });
  t.after(() => old.stop());
  const { port } = await old.start();
  const status = await adapter.enable({ port, tunnelMode: 'named' });
  assert.equal(status.running, true);
  assert.notEqual(status.port, port);
  assert.equal(handedOff, 0);
  assert.equal(old.listening, true);
  assert.equal(tunnelCalls[0].port, status.port);
  assert.equal(tunnelCalls[0].mode, 'quick');
  const qr = await adapter.pairingInfo();
  assert.equal(qr.pairing.baseUrl, `https://desktop-${status.port}.example.invalid`);
  assert.equal(qr.pairing.token, newToken);
  const response = await fetch(`http://127.0.0.1:${status.port}/v1/snapshot`, { headers: { Authorization: `Bearer ${newToken}` } });
  assert.equal(response.status, 200);
  assert.equal((await fetch(`http://127.0.0.1:${status.port}/v1/snapshot`, { headers: { Authorization: `Bearer ${oldToken}` } })).status, 401);
  assert.equal(adapter.status().running, true);
});

test('an unrelated server is left untouched while Desktop starts separately', async t => {
  const { adapter } = await fixture(t);
  let writes = 0;
  const other = http.createServer((request, response) => {
    if (request.method === 'POST') ++writes;
    response.writeHead(200, { 'Content-Type': 'application/json' });
    response.end(JSON.stringify({ ok: true, service: 'unrelated' }));
  });
  t.after(() => new Promise(resolve => other.close(resolve)));
  await new Promise(resolve => other.listen(0, '127.0.0.1', resolve));
  const { port } = other.address();
  const status = await adapter.enable({ port, tunnelMode: 'off' });
  assert.notEqual(status.port, port);
  assert.equal(writes, 0);
  assert.equal(other.listening, true);
  assert.equal(adapter.status().enabled, true);
  assert.equal(adapter.status().running, true);
});

test('Desktop retries on its configured port after it becomes available', async t => {
  const { adapter } = await fixture(t);
  let handedOff = 0;
  const other = createRemoteGateway({ port: await freePort(), authToken: oldToken, handlers: { handoff: async () => { ++handedOff; return {}; } } });
  t.after(() => other.stop());
  const { port } = await other.start();
  const first = await adapter.enable({ port, tunnelMode: 'off' });
  assert.notEqual(first.port, port);
  assert.equal(handedOff, 0);
  assert.equal(other.listening, true);
  await adapter.disable();
  await other.stop();
  const second = await adapter.enable({ port, tunnelMode: 'off' });
  assert.equal(second.port, port);
  assert.equal(second.running, true);
});

test('overlapping enable and disable requests serialize and release their actual listening port', async t => {
  const { adapter } = await fixture(t);
  const reserve = http.createServer();
  await new Promise(resolve => reserve.listen(0, '127.0.0.1', resolve));
  const { port } = reserve.address();
  await new Promise(resolve => reserve.close(resolve));
  const enabling = adapter.enable({ port, tunnelMode: 'off' });
  const disabling = adapter.disable();
  await Promise.all([enabling, disabling]);
  assert.equal(adapter.status().running, false);
  assert.equal(adapter.status().enabled, false);
  await new Promise((resolve, reject) => { reserve.once('error', reject); reserve.listen(port, '127.0.0.1', resolve); });
  await new Promise(resolve => reserve.close(resolve));
  await tick(1);
});

test('shutdown completes even if an HTTP peer leaves its request unfinished', { timeout: 2500 }, async t => {
  const { adapter } = await fixture(t);
  const status = await adapter.enable({ port: await freePort(), tunnelMode: 'off' });
  const peer = net.connect(status.port, '127.0.0.1');
  t.after(() => peer.destroy());
  peer.on('error', () => {});
  await new Promise(resolve => peer.once('connect', resolve));
  peer.write('GET /health HTTP/1.1\r\nHost: localhost\r\n');
  await tick(20);
  const before = Date.now();
  await adapter.disable();
  assert.ok(Date.now() - before < 1500);
  assert.equal(adapter.status().running, false);
});

test('Windows reserved nearby ports use an OS-allocated listener instead of failing startup', async t => {
  let attempts = 0;
  const requested = await freePort();
  const adapter = createRemoteAdapter({
    identity: { loadOrCreate: async () => ({ pairingToken: newToken, deviceSeed: 'new-pc' }) },
    seam: { gateway: { createRemoteGateway: options => {
      const failure = ['EADDRINUSE', 'EACCES'][attempts++];
      if (failure) return { start: async () => { throw Object.assign(new Error('injected unavailable port'), { code: failure }); }, stop: async () => {} };
      return createRemoteGateway(options);
    } } },
  });
  t.after(() => adapter.disable());
  const status = await adapter.enable({ port: requested, tunnelMode: 'off' });
  assert.equal(status.running, true);
  assert.equal(status.reasonCode, 'port_fallback');
  assert.equal(attempts, 3);
});
