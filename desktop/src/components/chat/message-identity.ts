import type { ChatMessage, StreamSource } from './types';
import type { TextEvent, ThinkingEvent } from '../../host-adapter/loop-events';

export function lastUserIndex(messages: readonly ChatMessage[]): number {
  for (let index = messages.length - 1; index >= 0; index--) {
    const message = messages[index];
    // Round-3 (P0-5): a mid-run guidance bubble is an intervention INSIDE the
    // turn already running, so it must not become the turn boundary. Without
    // this skip, every assistant/tool row after a guidance inherits the
    // guidance's id — which read exactly like "the model adopted my steering"
    // while the run had never restarted (the run ledger kept the original
    // turnId, and the two records contradicted each other).
    if (message?.kind === 'text' && message.role === 'user') {
      if (message.steerState !== undefined) continue;
      return index;
    }
  }
  return -1;
}

type EventIdentity = { readonly seq: number; readonly ts: number; readonly turn?: number; readonly blockId?: string };

/** Pure and restart-safe: no renderer-global counter or random id. */
export function eventMessageId(messages: readonly ChatMessage[], event: EventIdentity, prefix: string): string {
  const user = messages[lastUserIndex(messages)];
  const scope = user?.id ?? `unbound-turn-${event.turn ?? 0}`;
  const block = event.blockId === undefined ? '' : `-block:${encodeURIComponent(event.blockId)}`;
  return `${prefix}-${encodeURIComponent(scope)}-${event.ts}-${event.seq}${block}`;
}

export function legacyWarningId(ts: number, seq: number): string {
  return `warn-${ts}-${seq}`;
}

/** Exact block identity is preferred; old emitters retain a bounded receipt
 * range rather than a growing list of every streamed token event. */
export function findStreamMessage(messages: readonly ChatMessage[], event: TextEvent | ThinkingEvent): number {
  const boundary = lastUserIndex(messages);
  for (let index = messages.length - 1; index > boundary; index--) {
    const message = messages[index];
    if (!message || message.kind !== event.type || message.role !== 'assistant') continue;
    const source = message.streamSource;
    if (!source) continue;
    if (event.blockId !== undefined) {
      if (source.blockId === event.blockId) return index;
    } else if (source.blockId === undefined && event.seq >= source.firstSeq
      && event.seq <= source.lastSeq && event.ts >= source.firstTs && event.ts <= source.lastTs) {
      return index;
    }
  }
  return -1;
}

export function streamSource(event: TextEvent | ThinkingEvent, previous?: StreamSource): StreamSource {
  return {
    ...(event.blockId !== undefined ? { blockId: event.blockId } : {}),
    firstSeq: Math.min(previous?.firstSeq ?? event.seq, event.seq),
    lastSeq: Math.max(previous?.lastSeq ?? event.seq, event.seq),
    firstTs: Math.min(previous?.firstTs ?? event.ts, event.ts),
    lastTs: Math.max(previous?.lastTs ?? event.ts, event.ts),
  };
}

function isPersistedStreamSource(value: unknown): value is StreamSource {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const source = value as Record<string, unknown>;
  const allowed = new Set(['blockId', 'firstSeq', 'lastSeq', 'firstTs', 'lastTs']);
  if (!Object.keys(source).every(key => allowed.has(key))) return false;
  if (source.blockId !== undefined && typeof source.blockId !== 'string') return false;
  const bounds = [source.firstSeq, source.lastSeq, source.firstTs, source.lastTs];
  if (!bounds.every(bound => typeof bound === 'number' && Number.isFinite(bound) && bound >= 0)) return false;
  return Number(source.firstSeq) <= Number(source.lastSeq) && Number(source.firstTs) <= Number(source.lastTs);
}

/** Repair key collisions at the history boundary. Keep distinct content and
 * user turns, including identical answers that genuinely occurred twice. */
export function normalizeMessageIds(messages: readonly ChatMessage[]): readonly ChatMessage[] {
  const reserved = new Set(messages.map(message => message.id));
  const used = new Set<string>();
  let changed = false;
  let userRemap: { original: string; repaired: string } | undefined;
  const repaired = messages.map(message => {
    const invalidReceipt = message.streamSource !== undefined && !isPersistedStreamSource(message.streamSource);
    const legacy = message.kind === 'notice' && /^warn-\d+$/.test(message.id);
    const base = legacy ? legacyWarningId(message.createdAt, Number(message.id.slice(5))) : message.id;
    let id = base;
    let suffix = 1;
    while (used.has(id) || (id !== message.id && reserved.has(id))) id = `${base}:restored:${suffix++}`;
    used.add(id);
    if (message.kind === 'text' && message.role === 'user') {
      userRemap = { original: message.id, repaired: id };
    }
    const turnId = userRemap && message.turnId === userRemap.original
      ? userRemap.repaired : message.turnId;
    if (id === message.id && turnId === message.turnId && !invalidReceipt) return message;
    changed = true;
    return { ...message, id, ...(turnId !== undefined ? { turnId } : {}),
      ...(invalidReceipt ? { streamSource: undefined } : {}) };
  });
  return changed ? repaired : messages;
}
