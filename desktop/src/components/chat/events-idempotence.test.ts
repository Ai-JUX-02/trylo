import { describe, expect, it } from 'vitest';
import { applyEvents } from './events';
import type { ChatMessage } from './types';
import type { LoopEvent } from '../../host-adapter/loop-events';
import { normalizeWorkspaceHistory } from '../../host-adapter/conversation-history';

const user = (id: string, createdAt = 1): ChatMessage =>
  ({ id, createdAt, kind: 'text', role: 'user', text: 'same question' });
const use: LoopEvent = { type: 'tool_use', seq: 3, ts: 3, turn: 1,
  id: 'call-a', tool: 'Read', input: { file_path: 'a.txt' } };
const result: LoopEvent = { type: 'tool_result', seq: 4, ts: 4, turn: 1,
  id: 'call-a', tool: 'Read', ok: true, output: 'value', durationMs: 1 };

describe('chat projection replay and restart invariants', () => {
  it('keeps 100 restarted turns replay-safe through serialization and restore', () => {
    let messages: ChatMessage[] = [];
    for (let index = 0; index < 100; index++) {
      messages = [...messages, user(`user-${index}`)];
      const events: LoopEvent[] = [
        { type: 'thinking', seq: 1, ts: 1, turn: 1, blockId: 'reasoning',
          summary: 'Inspect', preview: 'Inspect', fullLength: 7, partial: false },
        use, result,
        { type: 'text', seq: 5, ts: 5, turn: 1, blockId: 'answer', preview: 'Same answer' },
        { type: 'runtime_warning', seq: 6, ts: 6, code: 'denied', message: 'Same warning' },
        { type: 'turn_end', seq: 7, ts: 7, turn: 1, stopReason: 'end_turn' },
      ];
      const once = applyEvents(messages, events);
      const restored: ChatMessage[] = JSON.parse(JSON.stringify(once));
      expect(applyEvents(restored, events)).toEqual(once);
      messages = once;
    }
    expect(new Set(messages.map(message => message.id)).size).toBe(messages.length);
    expect(messages.filter(message => message.kind === 'tool')).toHaveLength(100);
    expect(messages.filter(message => message.kind === 'notice')).toHaveLength(100);
    expect(messages.filter(message => message.kind === 'text' && message.role === 'assistant')).toHaveLength(100);
  });
  it('does not resurrect a pending compaction when trigger and result are replayed', () => {
    const trigger: LoopEvent = { type: 'compaction_trigger', seq: 1, ts: 1,
      preTokens: 100, postTokens: 50, trigger: 'auto' };
    const compact: LoopEvent = { type: 'compact', seq: 2, ts: 2,
      kind: 'boundary', tokensBefore: 100, tokensAfter: 50, reason: 'auto' };
    const once = applyEvents([user('u1')], [trigger, compact]);
    expect(applyEvents(once, [trigger, compact])).toEqual(once);
    const second = applyEvents([...once, user('u2', 20)], [trigger, compact]);
    expect(second.filter(message => message.kind === 'compaction')).toHaveLength(2);
  });

  it('deduplicates persisted compactions within a turn while preserving a later real compaction', () => {
    const compact: ChatMessage = { id: 'compact-1', kind: 'compaction', role: 'system',
      createdAt: 2, tokensBefore: 100, tokensAfter: 50, reason: 'auto' };
    const messages = [user('u1'), compact, { ...compact, id: 'compact-2' },
      user('u2', 20), { ...compact, id: 'compact-3', createdAt: 21 }];
    const history = normalizeWorkspaceHistory({ conversations: { chat: {
      session: { id: 'chat', kind: 'code', mode: 'agent', title: 'chat', createdAt: 1 }, messages,
    } } });
    expect(history.conversations.chat!.messages.filter(message => message.kind === 'compaction')).toHaveLength(2);
  });
  it('is pure when React evaluates a state updater twice', () => {
    const events: LoopEvent[] = [
      { type: 'thinking', seq: 1, ts: 1, turn: 1, summary: 'Think', preview: 'Think', fullLength: 5, partial: false },
      use, result, { type: 'text', seq: 5, ts: 5, turn: 1, preview: 'Answer' },
      { type: 'turn_end', seq: 6, ts: 6, turn: 1, stopReason: 'end_turn' },
    ];
    const input = [user('u1')];
    expect(applyEvents(input, events)).toEqual(applyEvents(input, events));
    expect(input).toEqual([user('u1')]);
  });

  it('keeps a settled tool settled when its start is replayed', () => {
    const once = applyEvents([user('u1')], [use, result]);
    expect(applyEvents(once, [use, result])).toEqual(once);
  });

  it('keeps reused tool call ids in different user turns separate', () => {
    const first = applyEvents([user('u1')], [use, result]);
    const second = applyEvents([...first, user('u2', 20)], [use,
      { ...result, type: 'tool_result', output: 'second' }]);
    expect(second.filter(message => message.kind === 'tool')
      .map(message => message.kind === 'tool' ? message.outputText : '')).toEqual(['value', 'second']);
  });

  it('does not overwrite an older turn-end row when the process turn counter restarts', () => {
    const end: LoopEvent = { type: 'turn_end', seq: 5, ts: 5, turn: 1,
      stopReason: 'end_turn', usage: { input_tokens: 10 } };
    const first = applyEvents([user('u1')], [end]);
    const second = applyEvents([...first, user('u2', 20)], [
      { ...end, ts: 25, usage: { input_tokens: 20 } },
    ]);
    const turns = second.filter(message => message.kind === 'turn');
    expect(turns).toHaveLength(2);
    expect(turns.map(message => message.turnId)).toEqual(['u1', 'u2']);
    expect(turns.map(message => message.kind === 'turn' ? message.usage?.input_tokens : 0)).toEqual([10, 20]);
  });

  it('does not duplicate or reopen a completed subagent on replay', () => {
    const spawn: LoopEvent = { type: 'subagent', seq: 1, ts: 1,
      kind: 'spawn', id: 'sub-a', agentType: 'Explore', prompt: 'scan' };
    const end: LoopEvent = { type: 'subagent', seq: 2, ts: 2,
      kind: 'end', id: 'sub-a', result: 'done' };
    const once = applyEvents([user('u1')], [spawn, end]);
    expect(applyEvents(once, [spawn, end])).toEqual(once);
    const twice = applyEvents([...once, user('u2', 20)], [spawn, end]);
    expect(twice.filter(message => message.kind === 'subagent')).toHaveLength(2);
    expect(new Set(twice.map(message => message.id)).size).toBe(twice.length);
  });

  it('replays a text block into its own row after intervening tools', () => {
    const start = { type: 'text' as const, seq: 1, ts: 1, turn: 1, blockId: 'block-a',
      preview: 'I will read', partial: true };
    const end = { ...start, seq: 2, ts: 2, partial: false };
    const final = { ...end, seq: 5, ts: 5, blockId: 'block-b', preview: 'Done' };
    const events: LoopEvent[] = [start, end, use, result, final];
    const once = applyEvents([user('u1')], events);
    expect(applyEvents(once, events)).toEqual(once);
    expect(once.filter(message => message.kind === 'text' && message.role === 'assistant'))
      .toHaveLength(2);
  });

  it('preserves distinct text blocks and real same-content answers across turns', () => {
    const a = { type: 'text' as const, seq: 1, ts: 1, turn: 1, blockId: 'a', preview: 'Same' };
    const b = { ...a, seq: 2, ts: 2, blockId: 'b' };
    const first = applyEvents([user('u1')], [a, b]);
    const second = applyEvents([...first, user('u2', 20)], [a]);
    expect(second.filter(message => message.kind === 'text' && message.role === 'assistant'))
      .toHaveLength(3);
  });

  it('repairs all duplicate persisted message keys without deleting content or user turns', () => {
    const messages: ChatMessage[] = [user('u1'),
      { id: 'text-1', kind: 'text', role: 'assistant', text: 'first', createdAt: 2, turnId: 'u1' },
      user('u2', 20),
      { id: 'text-1', kind: 'text', role: 'assistant', text: 'second', createdAt: 21, turnId: 'u2' },
    ];
    const raw = { conversations: { chat: { session: { id: 'chat', kind: 'code',
      mode: 'agent', title: 'chat', createdAt: 1, updatedAt: 21 }, messages } } };
    const history = normalizeWorkspaceHistory(raw);
    const repaired = history.conversations.chat!.messages;
    expect(new Set(repaired.map(message => message.id)).size).toBe(4);
    expect(repaired.map(message => message.kind === 'text' ? message.text : '')).
      toEqual(['same question', 'first', 'same question', 'second']);
    expect(normalizeWorkspaceHistory(history)).toEqual(history);
  });
});
