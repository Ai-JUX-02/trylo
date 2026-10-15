// Trylo Desktop — terminal-state record for a stopped run (Round-3 P1-9).
//
// Reported from a real window: after `Stop`, the run's persisted result carried
// `status = "cancelled"`, 657,998 ms and 30 tool calls — but the conversation
// itself ended on a HALF-STREAMED LINE ("Words and lengths:") with no closing
// record at all. The only signal was a `1 active` badge quietly disappearing.
// Coming back to that transcript later there is no way to tell whether the run
// finished, crashed, or was stopped by the person reading it.
//
// The lifecycle observer already fires EXACTLY ONCE per runId across
// loop_end / session_end / process exit / cancel, so it is the honest place to
// hang the closing record: no polling, no guessing from the event buffer, no
// dependence on the UI still being mounted on this conversation.
//
// Scope: `cancelled` only — the other outcomes already leave something behind
// (a failed run writes an error card, a completed run ends with its final
// answer). `exited` is deliberately left out: it needs its own product wording
// and is not what this ticket is about.

import type { CodeRunLifecycleObserver, CodeRunOutcome } from '../../runtime/code-run-lifecycle';
import type { RuntimeResultScope } from '../../results/result-scope';
import type { ChatMessage } from './types';

/** Where a terminal record must land. The target is resolved at TERMINAL time,
 *  not at mount — the user may have navigated to another conversation mid-run. */
export interface TerminalNoticeTarget {
  readonly root: string;
  readonly conversationId: string;
  readonly message: ChatMessage;
}

/**
 * The only judgement call here: what a cancelled run leaves in the transcript.
 * Same weight as a notice (it is a record, not a failure card), and it says
 * plainly that this round produced no closing summary — so a person scrolling
 * back months later knows the run was STOPPED, not finished.
 */
export function cancelledNoticeMessage(
  scope: RuntimeResultScope,
  now: number,
): ChatMessage {
  return {
    id: `run-cancelled:${scope.runId}`,
    kind: 'notice',
    role: 'system',
    createdAt: now,
    turnId: scope.turnId,
    text: '任务已被手动停止 · 本轮未产出总结（后续内容未完成）',
  };
}

export function isRecordableOutcome(outcome: CodeRunOutcome): boolean {
  return outcome === 'cancelled';
}

/**
 * Observer that drops one closing record per cancelled run.
 *
 * Idempotent twice over: the controller promises exactly-once termination per
 * runId, and the notice id is derived from that runId, so a replayed terminal
 * (or a UI that re-subscribes) can never stack duplicates.
 */
export function createTerminalNoticeObserver(
  append: (target: TerminalNoticeTarget) => void,
  now: () => number = () => Date.now(),
): CodeRunLifecycleObserver {
  const written = new Set<string>();
  return {
    // Start and event batches are none of this observer's business — it only
    // speaks at the terminal, which the controller guarantees is once per run.
    onRunStarted: () => undefined,
    onEvents: () => undefined,
    onRunTerminal(scope, outcome) {
      if (!isRecordableOutcome(outcome)) return;
      if (written.has(scope.runId)) return;
      written.add(scope.runId);
      const conversationId = scope.conversationId;
      if (!conversationId) return;
      append({
        root: scope.projectRoot,
        conversationId,
        message: cancelledNoticeMessage(scope, now()),
      });
    },
  };
}
