// Round-3 (P1-9): a manually stopped run must leave a closing record.
//
// Before this, `Stop` produced `results.code.latestRun.meta.status =
// "cancelled"` — honest machine truth — while the visible conversation just
// stopped mid-sentence. Nothing in the transcript said STOPPED, FINISHED or
// FAILED, and Persisting meant the ambiguity survived the session.
import { describe, expect, it } from 'vitest';
import {
  cancelledNoticeMessage,
  createTerminalNoticeObserver,
  isRecordableOutcome,
  type TerminalNoticeTarget,
} from './run-terminal-notice';
import type { RuntimeResultScope } from '../../results/result-scope';

const scope: RuntimeResultScope = {
  projectKey: 'proj',
  projectRoot: '/repo',
  conversationId: 'conv-1',
  mode: 'code',
  runId: 'run-9',
  turnId: 'user-abc',
  startedAt: 1000,
};

function collect(): { targets: TerminalNoticeTarget[]; observer: ReturnType<typeof createTerminalNoticeObserver> } {
  const targets: TerminalNoticeTarget[] = [];
  const observer = createTerminalNoticeObserver((t) => {
    targets.push(t);
  }, () => 4242);
  return { targets, observer };
}

describe('run terminal notice (Round-3 P1-9)', () => {
  it('records a notice for a cancelled run', async () => {
    const { targets, observer } = collect();
    await observer.onRunTerminal(scope, 'cancelled');
    expect(targets).toHaveLength(1);
    expect(targets[0]!.conversationId).toBe('conv-1');
    expect(targets[0]!.root).toBe('/repo');
    // Same weight as a notice, and it states that no summary was produced.
    expect(targets[0]!.message).toMatchObject({
      kind: 'notice',
      role: 'system',
      text: expect.stringContaining('未产出总结'),
    });
    // The record belongs to the turn that was cancelled.
    expect(targets[0]!.message.turnId).toBe('user-abc');
  });

  it('never records the same run twice (exactly-once + idempotent id)', async () => {
    const { targets, observer } = collect();
    await observer.onRunTerminal(scope, 'cancelled');
    await observer.onRunTerminal(scope, 'cancelled');
    expect(targets).toHaveLength(1);
    // The id is derived from the runId, so even a fresh observer cannot
    // stack a second row for the same run.
    expect(cancelledNoticeMessage(scope, 1).id).toBe('run-cancelled:run-9');
  });

  it('does NOT invent a record for outcomes that already leave one', async () => {
    const { targets, observer } = collect();
    await observer.onRunTerminal(scope, 'completed');
    await observer.onRunTerminal(scope, 'failed');
    await observer.onRunTerminal(scope, 'exited');
    expect(targets).toHaveLength(0);
    expect(isRecordableOutcome('cancelled')).toBe(true);
    expect(isRecordableOutcome('completed')).toBe(false);
  });

  it('keeps each run separate', async () => {
    const { targets, observer } = collect();
    await observer.onRunTerminal({ ...scope, runId: 'run-1' }, 'cancelled');
    await observer.onRunTerminal({ ...scope, runId: 'run-2' }, 'cancelled');
    expect(targets.map((t) => t.message.id)).toEqual([
      'run-cancelled:run-1',
      'run-cancelled:run-2',
    ]);
  });
});
