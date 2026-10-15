// Round-3 P1-11: a turn that delivered nothing must not read as finished.
//
// Acceptance evidence (session code-musy5wnw-sz4xu, and the Grok 4.5 run
// before it):
//
//   1 notice  "check --model, the endpoint and the request options"
//   2 turn    status="done"  stopReason="tool_use"  usage={"input_tokens":0,"output_tokens":0}
//
// Zero tokens, zero tools, the provider refused the request — and the
// transcript said `done`. Root cause had two halves, both fixed here:
//
//   1. `trylo-v1-event-adapter` encoded EVERY non-completed outcome as
//      `stopReason: 'tool_use'`.
//   2. `applyTurnEnd` treated only `max_tokens` as failure.

import { describe, expect, it } from 'vitest';
import { applyEvents } from './events';
import { turnCompletion } from './types';
import { TryloV1EventAdapter } from '../../host-adapter/trylo-v1-event-adapter';
import type { LoopEvent, TurnEndEvent } from '../../host-adapter/loop-events';
import type { ChatMessage, TurnMessage } from './types';

function turnEnd(over: Partial<TurnEndEvent> = {}): TurnEndEvent {
  return { type: 'turn_end', seq: 9, ts: 500, turn: 1, stopReason: 'end_turn', ...over };
}

function turns(messages: readonly ChatMessage[]): TurnMessage[] {
  return messages.filter((m): m is TurnMessage => m.kind === 'turn');
}

/** The user bubble App appends at send time — `applyEvents` never makes it. */
const USER_BUBBLE: ChatMessage = {
  id: 'user-musy262h', kind: 'text', role: 'user', createdAt: 1791065341241, text: 'do it',
};

describe('P1-11 — a turn that delivered nothing is not a done turn', () => {
  it('records a 0-token, text-less turn as error, not done (the P0-6 record)', () => {
    const messages = applyEvents(
      [USER_BUBBLE],
      [turnEnd({ stopReason: 'failed', usage: { input_tokens: 0, output_tokens: 0 } })],
    );
    const [turn] = turns(messages);
    expect(turn?.status).toBe('error');
    expect(turn?.incomplete).toBe(true);
  });

  it('marks a delivered turn as complete and not incomplete', () => {
    const messages = applyEvents(
      applyEvents(
        [USER_BUBBLE],
        [{ type: 'text', seq: 5, ts: 300, turn: 1, blockId: 'b2', fullText: 'done', preview: 'done' }],
      ),
      [turnEnd({ stopReason: 'end_turn', usage: { input_tokens: 16157, output_tokens: 364 } })],
    );
    const [turn] = turns(messages);
    expect(turn?.status).toBe('done');
    expect(turn?.incomplete).toBeUndefined();
  });

  it('does not call a tool-only turn incomplete — tools are delivery', () => {
    const messages = applyEvents(
      applyEvents(
        [USER_BUBBLE],
        [{ type: 'tool_use', seq: 5, ts: 300, turn: 1, id: 'c1', tool: 'Bash', input: { command: 'ls' } }],
      ),
      [turnEnd({ stopReason: 'tool_use' })],
    );
    const [turn] = turns(messages);
    expect(turn?.incomplete).toBeUndefined();
    expect(turn?.status).toBe('done');
  });

  it('treats max_tokens as failure and an absent stop reason as unproven', () => {
    expect(turnCompletion('max_tokens')).toBe('failed');
    expect(turnCompletion('failed')).toBe('failed');
    expect(turnCompletion('end_turn')).toBe('completed');
    expect(turnCompletion('tool_use')).toBe('completed');
    expect(turnCompletion(undefined)).toBe('incomplete');
  });

  it('v1 adapter no longer encodes a failed run as tool_use', () => {
    const adapter = new TryloV1EventAdapter();
    adapter.feed(JSON.stringify({ type: 'run_start', sessionId: 's', turnId: 't',
      providerId: 'p', model: 'm' }));
    const events: LoopEvent[] = [];
    for (const line of [
      '{"type":"warning","code":"provider_refused","message":"check --model"}',
      // The real run_result shape (trylo-v1-protocol.ts:77): status, not outcome.
      '{"type":"run_result","status":"failed","finishReason":"error",'
      + '"sessionId":"s","turnId":"t","iterations":1,'
      + '"usage":{"inputTokens":0,"outputTokens":0,"totalTokens":0},'
      + '"durationMs":5100,"lastMessage":""}',
    ]) {
      for (const event of adapter.feed(line)) events.push(event);
    }
    const end = events.find((e): e is TurnEndEvent => e.type === 'turn_end');
    expect(end?.stopReason).toBe('failed');
  });

  it('a failed run with no assistant text records error + incomplete end to end', () => {
    const adapter = new TryloV1EventAdapter();
    adapter.feed(JSON.stringify({ type: 'run_start', sessionId: 's', turnId: 't',
      providerId: 'p', model: 'm' }));
    const events: LoopEvent[] = [];
    for (const line of [
      '{"type":"message_start"}',
      // P0-6 verbatim: no text_delta at all, the provider refused up front.
      '{"type":"message_end"}',
      '{"type":"warning","code":"provider_refused","message":"check --model"}',
      '{"type":"run_result","status":"failed","finishReason":"error",'
      + '"sessionId":"s","turnId":"t","iterations":1,'
      + '"usage":{"inputTokens":0,"outputTokens":0,"totalTokens":0},'
      + '"durationMs":5100,"lastMessage":""}',
    ]) {
      for (const event of adapter.feed(line)) events.push(event);
    }
    const messages = applyEvents([USER_BUBBLE], events);
    const [turn] = turns(messages);
    expect(turn?.status).toBe('error');
    expect(turn?.incomplete).toBe(true);
    // The reason stays on screen — this is the P0-6 half of the complaint.
    expect(messages.some(m => m.kind === 'notice')).toBe(true);
  });
});

// Regression, found by the full-suite run: `applyTurnEnd`'s update-in-place
// branch wrote `incomplete` bare, so a replay added a key the first pass never
// set and `applyEvents` stopped being a fixed point. Asserted here because the
// failure surfaced 6 files away in events-idempotence.test.ts.
describe('P1-11 — turn records are replay-idempotent', () => {
  it('leaves a turn byte-identical when its turn_end is replayed', () => {
    const end = turnEnd({ stopReason: 'end_turn', usage: { input_tokens: 10, output_tokens: 4 } });
    const once = applyEvents([USER_BUBBLE], [end]);
    const restored = JSON.parse(JSON.stringify(once)) as ChatMessage[];
    expect(applyEvents(restored, [end])).toEqual(once);
  });

  it('leaves an incomplete turn byte-identical when replayed', () => {
    // 0 output tokens + no assistant text = the incomplete case.
    const end = turnEnd({ stopReason: 'end_turn', usage: { input_tokens: 0, output_tokens: 0 } });
    const once = applyEvents([USER_BUBBLE], [end]);
    const restored = JSON.parse(JSON.stringify(once)) as ChatMessage[];
    expect(turns(once)[0]?.incomplete).toBe(true);
    expect(applyEvents(restored, [end])).toEqual(once);
  });

  it('does not claim incompleteness when usage was simply not reported', () => {
    // The CLI omits usage on some paths. A missing reading is not a reading of
    // zero, so this turn must not be branded 「本轮未完成」.
    const end = turnEnd({ stopReason: 'end_turn', usage: undefined });
    const once = applyEvents([USER_BUBBLE], [end]);
    expect(turns(once)[0]?.incomplete).toBeUndefined();
  });
});

