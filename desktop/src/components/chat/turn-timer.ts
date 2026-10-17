import type { ChatMessage, TextMessage, TurnTiming } from './types'
import { lastUserIndex } from './message-identity'

/** One terminal record per user turn. Old first-output durations are never
 * promoted to full execution times. */
export function finalizeLatestTurnTimer(
  msgs: readonly ChatMessage[],
  nowTs: number = Date.now(),
  outcome: TurnTiming['outcome'] = 'interrupted',
): ChatMessage[] {
  return finalizeTurnTimer(msgs, msgs[lastUserIndex(msgs)]?.id ?? '', nowTs, outcome)
}

/** Lifecycle observers settle by identity, so a late terminal cannot stamp a
 * newer turn after the user navigates or sends another message. */
export function finalizeTurnTimer(
  msgs: readonly ChatMessage[],
  turnId: string,
  nowTs: number,
  outcome: TurnTiming['outcome'],
): ChatMessage[] {
  const index = msgs.findIndex((message) => message.id === turnId)
  const user = msgs[index]
  if (
    !user ||
    user.kind !== 'text' ||
    user.role !== 'user' ||
    user.turnStartedAt === undefined ||
    user.turnTiming
  )
    return [...msgs]
  const updated: TextMessage = {
    ...user,
    turnTiming: { elapsedMs: Math.max(0, nowTs - user.turnStartedAt), outcome },
  }
  return msgs.map((message, position) => (position === index ? updated : message))
}
