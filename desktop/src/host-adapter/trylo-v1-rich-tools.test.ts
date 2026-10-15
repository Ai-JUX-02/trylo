import { describe, expect, it } from 'vitest';
import { TryloV1EventAdapter } from './trylo-v1-event-adapter';
import { parseCliV1Event } from './trylo-v1-protocol';

describe('trylo-v1 additive tool facts', () => {
  it('preserves tool input and diagnoses a failed call from its message', () => {
    const adapter = new TryloV1EventAdapter();
    const use = adapter.feed(JSON.stringify({ type: 'tool_use', toolCallId: 'call-1', name: 'read_file', input: { path: 'missing.ts' } }));
    expect(use[0]).toMatchObject({ type: 'tool_use', input: { path: 'missing.ts' } });
    const result = adapter.feed(JSON.stringify({ type: 'tool_result', toolCallId: 'call-1', status: 'failed', output: '', truncated: false, message: 'ENOENT: missing.ts' }));
    expect(result[0]).toMatchObject({ type: 'tool_result', tool: 'Read', ok: false, error: 'ENOENT: missing.ts' });
  });

  it('rejects a malformed optional input instead of rendering an empty card', () => {
    expect(parseCliV1Event(JSON.stringify({ type: 'tool_use', toolCallId: 'c', name: 'read_file', input: 'invalid' })).ok).toBe(false);
  });

  it('ignores late text and tool frames after the authoritative terminal', () => {
    const adapter = new TryloV1EventAdapter();
    adapter.feed(JSON.stringify({ type: 'run_result', status: 'completed', sessionId: 's', turnId: 't', finishReason: 'stop',
      iterations: 1, durationMs: 1, lastMessage: 'done', usage: { inputTokens: 1, outputTokens: 1, totalTokens: 2 } }));
    expect(adapter.feed('{"type":"message_delta","text":"late"}')).toEqual([]);
    expect(adapter.feed('{"type":"tool_use","toolCallId":"late","name":"write_file"}')).toEqual([]);
    expect(adapter.summary().outcome).toBe('completed');
  });
});
