import { describe, expect, it } from 'vitest';
import { TryloV1EventAdapter } from './trylo-v1-event-adapter';
import { applyEvents } from '../components/chat/events';
import type { ChatMessage } from '../components/chat/types';
import type { LoopEvent } from './loop-events';

function feed(adapter: TryloV1EventAdapter, frames: readonly object[]): LoopEvent[] {
  return frames.flatMap((frame) => adapter.feed(JSON.stringify(frame)));
}

function terminal(): object {
  return {
    type: 'run_result',
    status: 'completed',
    finishReason: 'stop',
    sessionId: 's',
    turnId: 't',
    iterations: 1,
    durationMs: 10,
    lastMessage: 'Answer.',
    usage: { inputTokens: 1, outputTokens: 1, totalTokens: 2 },
  };
}

const user: ChatMessage = { id: 'user', kind: 'text', role: 'user', text: 'Fix it.', createdAt: 0 };

describe('trylo-v1 visible reasoning and terminal presentation', () => {
  it('uses the legacy Desktop action summary for the same reasoning', () => {
    const adapter = new TryloV1EventAdapter();
    const events = feed(adapter, [
      { type: 'reasoning_start', redacted: false },
      { type: 'reasoning_delta', text: 'Let me inspect the adapter. Then I will patch it.' },
      { type: 'reasoning_end' },
    ]);
    const messages = applyEvents([user], events);
    expect(messages.find((message) => message.kind === 'thinking')).toMatchObject({
      summary: 'Inspect the adapter',
      preview: 'Let me inspect the adapter. Then I will patch it.',
      partial: false,
    });
  });

  it('preserves the full Desktop summary instead of truncating v1 at 240 characters', () => {
    const sentence = `检查${'完整的模块边界和实际调用链'.repeat(30)}。`;
    const adapter = new TryloV1EventAdapter();
    const events = feed(adapter, [
      { type: 'reasoning_start', redacted: false },
      { type: 'reasoning_delta', text: sentence },
      { type: 'reasoning_end' },
    ]);
    expect(
      applyEvents([user], events).find((message) => message.kind === 'thinking'),
    ).toMatchObject({ summary: sentence });
  });

  it('seals an open reasoning card before the authoritative terminal', () => {
    const adapter = new TryloV1EventAdapter();
    const initial = feed(adapter, [
      { type: 'reasoning_start', redacted: false },
      { type: 'reasoning_delta', text: 'Let me inspect the adapter.' },
    ]);
    const streamed = applyEvents([user], initial);
    const terminalEvents = feed(adapter, [terminal()]);
    const messages = applyEvents(streamed, terminalEvents);
    const reasoning = messages.filter((message) => message.kind === 'thinking');
    expect(reasoning).toHaveLength(1);
    expect(reasoning[0]).toMatchObject({ partial: false, preview: 'Let me inspect the adapter.' });
    expect(terminalEvents.map((event) => event.type)).toEqual(['thinking', 'turn_end', 'loop_end']);
    expect(
      terminalEvents.every(
        (event, index) => index === 0 || event.seq > terminalEvents[index - 1]!.seq,
      ),
    ).toBe(true);
  });

  it('seals an interrupted text card without turning cancellation into success', () => {
    const adapter = new TryloV1EventAdapter();
    const streamed = applyEvents(
      [user],
      feed(adapter, [
        { type: 'message_start' },
        { type: 'message_delta', text: 'Partial answer.' },
      ]),
    );
    const events = adapter.finalizeExit({ exitCode: 0, stderr: [], cancelled: true });
    const messages = applyEvents(streamed, events);
    expect(
      messages.filter((message) => message.kind === 'text' && message.role === 'assistant'),
    ).toEqual([expect.objectContaining({ text: 'Partial answer.', partial: false })]);
    expect(adapter.summary().outcome).toBe('cancelled');
    expect(events.find((event) => event.type === 'loop_end')).toMatchObject({ isError: true });
    expect(adapter.finalizeExit({ exitCode: 0, stderr: [], cancelled: true })).toEqual([]);
  });

  it('settles open redacted reasoning without exposing any supplied body', () => {
    const adapter = new TryloV1EventAdapter();
    const events = feed(adapter, [
      { type: 'reasoning_start', redacted: true },
      { type: 'reasoning_delta', text: 'private reasoning' },
      terminal(),
    ]);
    expect(
      applyEvents([user], events).find((message) => message.kind === 'thinking'),
    ).toMatchObject({
      summary: 'Reasoning was redacted',
      preview: '',
      fullLength: 0,
      partial: false,
    });
    expect(JSON.stringify(events)).not.toContain('private reasoning');
  });
});
