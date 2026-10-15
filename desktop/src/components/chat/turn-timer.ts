import type { ChatMessage, TextMessage } from './types';
import { lastUserIndex } from './message-identity';

export function hasAssistantOutputInTurn(
  msgs: readonly ChatMessage[],
  lastUserIdx: number,
): boolean {
  for (let i = msgs.length - 1; i > lastUserIdx; i--) {
    const m = msgs[i];
    if (!m) continue;
    if (m.kind === 'thinking' || (m.kind === 'text' && m.role === 'assistant')) {
      return true;
    }
  }
  return false;
}

/** Compute and stamp `finalElapsedMs` on the user
 *  message that started the current turn. Idempotent
 *  if already set (we don't overwrite a frozen
 *  value). Returns the (possibly unchanged) array.
 *  Pure — no React state. */
export function freezeTurnTimer(
  msgs: readonly ChatMessage[],
  lastUserIdx: number,
  nowTs: number,
): ChatMessage[] {
  if (lastUserIdx < 0) return [...msgs];
  const u = msgs[lastUserIdx];
  if (!u || u.kind !== 'text' || u.role !== 'user') return [...msgs];
  if (u.finalElapsedMs !== undefined) return [...msgs];
  const started = u.turnStartedAt;
  if (started === undefined) return [...msgs];
  const elapsed = Math.max(0, nowTs - started);
  const updated: TextMessage = { ...u, finalElapsedMs: elapsed };
  const out: ChatMessage[] = [...msgs];
  out[lastUserIdx] = updated;
  return out;
}

export function finalizeLatestTurnTimer(
  msgs: readonly ChatMessage[],
  nowTs: number = Date.now(),
): ChatMessage[] {
  return freezeTurnTimer(msgs, lastUserIndex(msgs), nowTs);
}

