import { describe, expect, it } from 'vitest';
import { TryloV1EventAdapter } from './trylo-v1-event-adapter';
import { applyEvents } from '../components/chat/events';
import { normalizePersistedToolResultContent } from '../tooling/tool-result-content';
import { parseCliV1Event } from './trylo-v1-protocol';

describe('v1 file change facts', () => {
  it('preserves committed file facts through adapter, reducer and history content normalization', () => {
    const adapter = new TryloV1EventAdapter();
    const feed = (event: unknown) => adapter.feed(JSON.stringify(event));
    feed({ type: 'run_start', sessionId: 's', turnId: 't', providerId: 'fixture', model: 'test' });
    const calls = feed({ type: 'tool_use', toolCallId: 'edit', name: 'apply_patch', input: { patch: 'unused' } });
    const facts = [{ path: 'a.txt', kind: 'patched', preview: '--- a/a.txt\n+++ b/a.txt\n@@ -1 +1 @@\n-old\n+new\n' }];
    const results = feed({ type: 'tool_result', toolCallId: 'edit', status: 'succeeded', output: 'done', truncated: false, fileChanges: facts });
    const messages = applyEvents([], [...calls, ...results]);
    const message = messages.find(m => m.kind === 'tool');
    expect(message).toMatchObject({ outputContent: [{ type: 'structured', schema: 'trylo.file-changes.v1', value: facts }] });
    if (message?.kind !== 'tool') throw new Error('missing tool');
    expect(normalizePersistedToolResultContent(JSON.parse(JSON.stringify(message.outputContent)))).toEqual(message.outputContent);
  });
  it('validates optional file facts and strips unknown persisted fields', () => {
    const frame = { type: 'tool_result', toolCallId: 'c', status: 'succeeded', output: '', truncated: false };
    for (const fileChanges of [[{ path: 'a', kind: 'invalid' }], [{ path: 'a', kind: 'patched', preview: 5 }],
      [{ path: 'a', kind: 'patched', preview: 'x'.repeat(40_000) }, { path: 'b', kind: 'patched', preview: 'x'.repeat(40_000) }]]) {
      expect(parseCliV1Event(JSON.stringify({ ...frame, fileChanges })).ok).toBe(false);
    }
    const clean = normalizePersistedToolResultContent([{ type: 'structured', schema: 'trylo.file-changes.v1', value: [
      { path: 'a', kind: 'patched', secret: 'not part of this contract' },
    ] }]);
    expect(clean).toEqual([{ type: 'structured', schema: 'trylo.file-changes.v1', value: [{ path: 'a', kind: 'patched' }] }]);
    expect(normalizePersistedToolResultContent([{ type: 'structured', schema: 'trylo.file-changes.v1', value: 'bad' }])).toBeUndefined();
  });
});
