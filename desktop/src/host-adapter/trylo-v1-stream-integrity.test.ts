// @vitest-environment node
import { expect, it } from 'vitest';
import { TryloV1EventAdapter } from './trylo-v1-event-adapter';
import { parseCliV1Event } from './trylo-v1-protocol';
import type { LoopEvent } from './loop-events';

const start = { type: 'run_start', sessionId: 's', turnId: 't', providerId: 'fixture', model: 'fixture' };
const terminal = { type: 'run_result', sessionId: 's', turnId: 't', status: 'completed', finishReason: 'stop',
  iterations: 1, durationMs: 100, lastMessage: 'done', usage: { inputTokens: 1, outputTokens: 1, totalTokens: 2 } };
function feed(adapter: TryloV1EventAdapter, ...frames: readonly object[]): LoopEvent[] {
  return frames.flatMap(frame => adapter.feed(JSON.stringify(frame)));
}

it('ignores replayed run_start without resetting its identity or opening another turn', () => {
  const adapter = new TryloV1EventAdapter();
  feed(adapter, start);
  expect(feed(adapter, start)).toEqual([]);
  feed(adapter, { ...start, sessionId: 'other' });
  expect(adapter.summary().sessionId).toBe('s');
  expect(adapter.rejectedLines()).toHaveLength(1);
});

it('rejects a terminal belonging to another session or turn', () => {
  for (const mismatch of [{ sessionId: 'other' }, { turnId: 'other' }]) {
    const adapter = new TryloV1EventAdapter();
    feed(adapter, start);
    expect(feed(adapter, { ...terminal, ...mismatch })).toEqual([]);
    expect(adapter.hasTerminal).toBe(false);
    expect(adapter.summary()).toMatchObject({ sessionId: 's', turnId: 't' });
    expect(adapter.rejectedLines()).toHaveLength(1);
  }
});

it('surfaces rejected frames even when a later run_result claims success', () => {
  const adapter = new TryloV1EventAdapter();
  feed(adapter, start);
  adapter.feed('broken-private-payload');
  const events = feed(adapter, terminal);
  expect(events).toContainEqual(expect.objectContaining({ type: 'runtime_warning', code: 'protocol_rejected' }));
  expect(events.find(event => event.type === 'loop_end')).toMatchObject({ isError: true });
  expect(adapter.summary().outcome).toBe('unknown');
  expect(JSON.stringify(events)).not.toContain('broken-private-payload');
});

it('does not report success with an unsettled tool call', () => {
  const adapter = new TryloV1EventAdapter();
  feed(adapter, start, { type: 'tool_use', toolCallId: 'pending', name: 'write_file', input: { path: 'proof' } });
  const events = feed(adapter, terminal);
  expect(adapter.summary().outcome).toBe('unknown');
  expect(events.find(event => event.type === 'tool_result')).toMatchObject({ ok: false, output: '' });
  expect(events.find(event => event.type === 'loop_end')).toMatchObject({ isError: true });
});

it('closes each open block before accepting a new block or tool call', () => {
  const adapter = new TryloV1EventAdapter();
  const events = feed(adapter, start,
    { type: 'message_start' }, { type: 'message_delta', text: 'first' },
    { type: 'message_start' }, { type: 'message_delta', text: 'second' },
    { type: 'reasoning_start', redacted: false }, { type: 'reasoning_delta', text: 'inspect' },
    { type: 'tool_use', toolCallId: 'call', name: 'read_file' });
  expect(events.flatMap(event => event.type === 'text' && !event.partial ? [event.fullText] : [])).toEqual(['first', 'second']);
  expect(events.filter(event => event.type === 'thinking' && !event.partial)).toHaveLength(1);
  expect(events.every((event, index) => index === 0 || event.seq > events[index - 1]!.seq)).toBe(true);
});

it('uses recorded tool result metadata even when its tool_use frame is absent', () => {
  const adapter = new TryloV1EventAdapter();
  const events = feed(adapter, { type: 'tool_result', toolCallId: 'call', name: 'read_file', code: 'ENOENT',
    status: 'failed', output: '', truncated: false, durationMs: 250 });
  expect(events[0]).toMatchObject({ type: 'tool_result', tool: 'Read', durationMs: 250, error: 'ENOENT' });
});

it('replayed tool calls do not close an unrelated live text block', () => {
  const adapter = new TryloV1EventAdapter();
  const call = { type: 'tool_use', toolCallId: 'call', name: 'read_file' };
  feed(adapter, call, { type: 'tool_result', toolCallId: 'call', status: 'succeeded', output: 'ok', truncated: false },
    { type: 'message_start' }, { type: 'message_delta', text: 'answer' });
  expect(feed(adapter, call)).toEqual([]);
  expect(feed(adapter, { type: 'message_end' })).toMatchObject([{ type: 'text', fullText: 'answer' }]);
});

it('rejects negative, overflowing and invalid tool result fields', () => {
  const frames = [
    { ...terminal, durationMs: -1 }, { ...terminal, durationMs: Infinity },
    { ...terminal, iterations: 0.5 }, { type: 'usage', usage: { inputTokens: -1, outputTokens: 1, totalTokens: 0 } },
    ...[{ durationMs: -1 }, { name: 17 }, { code: [] }, { status: 'unrecognised' }].map(fields => ({
      type: 'tool_result', toolCallId: 'c', status: 'succeeded', output: '', truncated: false, ...fields,
    })),
  ];
  for (const frame of frames) expect(parseCliV1Event(JSON.stringify(frame)).ok).toBe(false);
  expect(parseCliV1Event('{"type":"usage","usage":{"inputTokens":1e400,"outputTokens":1,"totalTokens":2}}').ok).toBe(false);
});
