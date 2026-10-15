import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { createToolProfileService } from '../../src/tooling/tool-profile-service.mjs';

test('Code and Work supply immutable native registries with canonical stdio and remote entries', async () => {
  const root = mkdtempSync(join(tmpdir(), 'trylo-native-profile-'));
  const definitions = {
    local: { command: 'node', args: ['server.js'], env: { LOCAL: 'yes' } },
    remote: { type: 'http', url: 'https://example.test/mcp', headers: {} },
    events: { type: 'sse', url: 'https://example.test/sse', headers: { Authorization: 'fixture' } },
  };
  const service = createToolProfileService({ storageRoot: root,
    catalog: { get: () => undefined, list: () => [] },
    hermes: { mcpArgs: () => ({ ok: true, arg: ['--mcp-config', JSON.stringify({ mcpServers: definitions })] }) },
  });
  const code = await service.resolve({ surface: 'code', projectRoot: root, conversationId: 'code' });
  const work = await service.resolve({ surface: 'work', projectRoot: root, conversationId: 'work' });
  assert.equal(code.ok, true); assert.equal(work.ok, true);
  assert.equal(code.spawnEnv.TRYLO_MCP_RUNTIME_MODE, 'overlay');
  assert.equal(work.spawnEnv.TRYLO_MCP_RUNTIME_MODE, 'exclusive');
  const document = JSON.parse(readFileSync(code.spawnEnv.TRYLO_MCP_RUNTIME_REGISTRY, 'utf8'));
  assert.deepEqual(document.servers, [
    { name: 'local', transport: 'stdio', command: 'node', args: ['server.js'], env: { LOCAL: 'yes' }, enabled: true },
    { name: 'remote', transport: 'http', url: 'https://example.test/mcp', enabled: true },
    { name: 'events', transport: 'sse', url: 'https://example.test/sse', headers: { Authorization: 'fixture' }, enabled: true },
  ]);
  assert.equal(document.formatVersion, 1);
  assert.equal(document.checksum, createHash('sha256').update(service.stableStringify(document.servers)).digest('hex'));
  assert.equal(work.spawnEnv.TRYLO_MCP_RUNTIME_REGISTRY, code.spawnEnv.TRYLO_MCP_RUNTIME_REGISTRY);
});
