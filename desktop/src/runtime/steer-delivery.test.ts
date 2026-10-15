// Round-3 (P0-5): one outcome per CAUSE, no false failures.
//
// The old contract was a single boolean: FALSE became
// `⚠ Task failed / 当前任务没有接受这条引导，请重试或先停止任务` no matter which
// of four different things had happened — including the case where the runtime
// simply cannot be interrupted mid-turn and NOTHING was attempted. It is not a
// timer: nothing here judges success from a deadline expiring.
import { describe, expect, it } from 'vitest';
import {
  isSteerDelivered,
  isSteerRetryable,
  steerBubbleState,
  steerOutcomeText,
  type SteerDelivery,
} from './steer-delivery';

const ALL: readonly SteerDelivery[] = [
  { kind: 'delivered' },
  { kind: 'unsupported' },
  { kind: 'not-running' },
  { kind: 'write-failed' },
];

describe('steer delivery outcomes (Round-3 P0-5)', () => {
  it('only a real write is "delivered"', () => {
    expect(isSteerDelivered({ kind: 'delivered' })).toBe(true);
    for (const d of ALL.filter((x) => x.kind !== 'delivered')) {
      expect(isSteerDelivered(d)).toBe(false);
    }
  });

  it('treats "the runtime cannot do this" as NOT retryable', () => {
    // Telling someone to retry something impossible is how we got here.
    expect(isSteerRetryable({ kind: 'unsupported' })).toBe(false);
    expect(isSteerRetryable({ kind: 'write-failed' })).toBe(true);
    expect(isSteerRetryable({ kind: 'not-running' })).toBe(true);
  });

  it('claims failure only where something actually failed', () => {
    // The old card said "任务没有接受这条引导" for all four cases.
    expect(steerBubbleState({ kind: 'delivered' })).toBe('delivered');
    expect(steerBubbleState({ kind: 'write-failed' })).toBe('failed');
    expect(steerBubbleState({ kind: 'not-running' })).toBe('failed');
    // `unsupported` produces NO guidance bubble at all: the text has not been
    // said yet, it was re-queued to run as the next real turn.
    expect(steerBubbleState({ kind: 'unsupported' })).toBeNull();
  });

  it('gives every outcome its own honest line (and silence when nothing broke)', () => {
    expect(steerOutcomeText({ kind: 'delivered' })).toBeNull();
    const unsupported = steerOutcomeText({ kind: 'unsupported' });
    expect(unsupported).toContain('不支持在运行中打断');
    expect(unsupported).toContain('本轮任务结束后');
    expect(steerOutcomeText({ kind: 'not-running' })).toContain('没有正在运行的任务');
    expect(steerOutcomeText({ kind: 'write-failed' })).toContain('未能送达');
    // No outcome asserts what the model did.
    for (const line of ALL.map(steerOutcomeText).filter((t): t is string => t !== null)) {
      expect(line).not.toContain('没有接受');
    }
  });
});
