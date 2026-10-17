import type { CodeRunLifecycleObserver } from '../../runtime/code-run-lifecycle'
import type { RuntimeResultScope } from '../../results/result-scope'
import type { ChatMessage } from './types'
import { finalizeTurnTimer } from './turn-timer'

type UpdateTurn = (
  scope: RuntimeResultScope,
  update: (messages: readonly ChatMessage[]) => ChatMessage[],
) => void

/** Completes timing even for startup errors and process exits with no loop_end.
 * The scope belongs to the run, independently of the currently visible chat. */
export function createTurnTimingObserver(
  update: UpdateTurn,
  now: () => number = Date.now,
): CodeRunLifecycleObserver {
  return {
    onRunStarted() {},
    onEvents() {},
    onRunTerminal(scope, outcome) {
      const endedAt = now()
      update(scope, (messages) =>
        finalizeTurnTimer(
          messages,
          scope.turnId,
          endedAt,
          outcome === 'exited' ? 'interrupted' : outcome,
        ),
      )
    },
  }
}
