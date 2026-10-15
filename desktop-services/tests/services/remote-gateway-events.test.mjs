import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { createFixture } from '../fixtures/mobile-ui-gateway.cjs';
const fixture = createFixture(49405);
const { gateway, token } = fixture;
const base = 'http://127.0.0.1:49405';
const headers = { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' };
const post = (path, body = {}) => fetch(base + path, { method: 'POST', headers, body: JSON.stringify(body) });
before(async () => { await gateway.start(); fixture.initialize(); });
after(() => gateway.stop());

test('new conversations require auth and preserve the selected Desktop surface', async () => {
  assert.equal((await fetch(base + '/v1/sessions', { method: 'POST', body: '{}' })).status, 401);
  const response = await post('/v1/sessions', { surface: 'work' });
  assert.equal(response.status, 202);
  const result = await response.json();
  assert.equal(gateway.getSnapshot().activeSessionId, result.sessionId);
  assert.equal(gateway.getSnapshot().sessions[0].surface, 'work');
  assert.deepEqual(gateway.getSnapshot().conversation, []);
});
test('tool calls update in place and retain input, output and failure status', async () => {
  await post('/v1/chat/messages', { text: 'fail', surface: 'work' });
  const snapshot = gateway.getSnapshot();
  assert.equal(snapshot.agent.status, 'failed');
  assert.equal(snapshot.agent.timeline.length, 2);
  const read = snapshot.agent.timeline.find(item => item.toolCallId === 'read');
  assert.equal(read.kind, 'inspect');
  assert.equal(read.state, 'done');
  assert.match(read.input, /App.tsx/);
  assert.match(read.output, /layout loaded/);
  assert.equal(snapshot.conversation.filter(item => item.toolCallId === 'read').length, 1);
  assert.equal(snapshot.conversation.find(item => item.toolCallId === 'failed').status, 'error');
});
test('approval completion freezes elapsed time and does not fabricate a blank reply', async () => {
  await post('/v1/sessions', { surface: 'code' });
  await post('/v1/chat/messages', { text: 'refresh UI', surface: 'code' });
  assert.equal(gateway.getSnapshot().approvals.length, 1);
  await post('/v1/permissions/fixture-approval/decision', { decision: 'allow' });
  const snapshot = gateway.getSnapshot();
  assert.equal(snapshot.agent.status, 'done');
  assert.equal(snapshot.approvals.length, 0);
  assert.equal(snapshot.conversation.filter(item => item.role === 'assistant').length, 1);
  assert.equal(snapshot.conversation.find(item => item.toolCallId === 'build').status, 'done');
  const elapsed = snapshot.agent.elapsedMs;
  gateway.publish({ type: 'agentState', state: 'idle' });
  assert.equal(gateway.getSnapshot().agent.status, 'done');
  await new Promise(resolve => setTimeout(resolve, 15));
  assert.equal(gateway.getSnapshot().agent.elapsedMs, elapsed);
});
test('stop retains an interrupted call; switching sessions clears task state and restores history', async () => {
  const original = gateway.getSnapshot().activeSessionId;
  await post('/v1/chat/messages', { text: 'stop this', surface: 'code' });
  await post('/v1/tasks/current/cancel');
  assert.equal(gateway.getSnapshot().agent.phase, 'stopped');
  assert.equal(gateway.getSnapshot().conversation.find(item => item.toolCallId === 'build' && item.status === 'interrupted')?.status, 'interrupted');
  await post('/v1/sessions', { surface: 'work' });
  assert.equal(gateway.getSnapshot().agent.timeline.length, 0);
  assert.equal(gateway.getSnapshot().agent.status, 'idle');
  assert.deepEqual(gateway.getSnapshot().conversation, []);
  await post(`/v1/sessions/${original}/select`);
  assert.ok(gateway.getSnapshot().conversation.some(item => item.role === 'thinking'));
  assert.ok(gateway.getSnapshot().conversation.some(item => item.role === 'tool'));
});

test('reasoning snapshots and their paired deltas do not duplicate text', () => {
  const at = Date.now();
  gateway.publish({ type: 'turnEvent', turnId: 'reasoning-check', event: { category: 'reasoning', detail: 'Inspect file', status: 'streaming' }, at });
  gateway.publish({ type: 'ideStreamThinking', turnId: 'reasoning-check', delta: 'Inspect file', at });
  const items = gateway.getSnapshot().conversation.filter(item => item.turnId === 'reasoning-check');
  assert.equal(items.length, 1);
  assert.equal(items[0].text, 'Inspect file');
  assert.equal(items[0].status, 'streaming');
  gateway.publish({ type: 'ideStreamThinking', turnId: 'reasoning-check', delta: ' carefully', at: at + 1 });
  assert.equal(gateway.getSnapshot().conversation.find(item => item.turnId === 'reasoning-check').text, 'Inspect file carefully');
});

test('a result updates a restored Desktop tool even when the projection id differs', () => {
  const at = Date.now();
  gateway.publish({ type: 'sessionState', activeSessionId: 'restored', sessions: [], conversation: [{ id: 'desktop-tool-id', role: 'tool', text: '', title: 'Read', status: 'streaming', toolCallId: 'restore-call', turnId: 'restore-turn', input: '{"path":"file.ts"}', at }] });
  gateway.publish({ type: 'trace', id: 'restore-turn:tool:restore-call', kind: 'tool', title: 'Read', toolCallId: 'restore-call', turnId: 'restore-turn', output: 'read result', phase: 'completed', at: at + 1 });
  const items = gateway.getSnapshot().conversation.filter(item => item.toolCallId === 'restore-call');
  assert.equal(items.length, 1);
  assert.equal(items[0].status, 'done');
  assert.match(items[0].input, /file.ts/);
  assert.equal(items[0].output, 'read result');
});
