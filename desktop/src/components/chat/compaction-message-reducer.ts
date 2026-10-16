import type { ChatMessage, CompactionMessage } from './types';
import type { CompactEvent, CompactionTriggerEvent } from '../../host-adapter/loop-events';
import { eventMessageId, lastUserIndex } from './message-identity';

function isPending(message: ChatMessage): boolean {
  return message.kind === 'notice' && message.text.startsWith('Compacting context');
}

export function applyCompactionTrigger(messages: ChatMessage[], event: CompactionTriggerEvent): ChatMessage[] {
  const boundary = lastUserIndex(messages);
  // A replayed trigger cannot resurrect waiting after its result arrived.
  if (messages.slice(boundary + 1).some(message => message.kind === 'compaction'
    && message.createdAt >= event.ts)) return messages;
  const existing = messages.findIndex((message, index) => index > boundary && isPending(message));
  const notice: ChatMessage = {
    id: existing >= 0 ? messages[existing]!.id : eventMessageId(messages, event, 'compact-pending'),
    kind: 'notice', role: 'system', createdAt: event.ts,
    turnId: messages[boundary]?.id,
    text: `Compacting context (${formatK(event.preTokens)} → ${formatK(event.postTokens)})…`,
  };
  return existing < 0 ? [...messages, notice]
    : messages.map((message, index) => index === existing ? notice : message);
}

export function applyCompact(messages: ChatMessage[], event: CompactEvent): ChatMessage[] {
  const boundary = lastUserIndex(messages);
  if (event.status === 'failed') return [...messages.filter((message, index) => index <= boundary || !isPending(message)), {
    id: eventMessageId(messages, event, 'compact-failed'), kind: 'notice', role: 'system', createdAt: event.ts,
    text: `上下文压缩未完成：${event.reason}`, turnId: messages[boundary]?.id,
  }];
  const duplicate = messages.slice(boundary + 1).some(message => message.kind === 'compaction'
    && message.tokensBefore === event.tokensBefore && message.tokensAfter === event.tokensAfter
    && message.reason === event.reason);
  if (duplicate) return messages;
  const compaction: CompactionMessage = {
    id: eventMessageId(messages, event, 'compact'), kind: 'compaction', role: 'system',
    createdAt: event.ts, turnId: messages[boundary]?.id,
    reason: event.reason, tokensBefore: event.tokensBefore, tokensAfter: event.tokensAfter,
    ...(event.requestContext ? { requestContext: true } : {}),
  };
  let replacement = -1;
  const output: ChatMessage[] = [];
  messages.forEach((message, index) => {
    if (index > boundary && isPending(message)) replacement = output.length;
    else output.push(message);
  });
  if (replacement < 0) return [...output, compaction];
  output.splice(replacement, 0, compaction);
  return output;
}

function formatK(value: number): string {
  if (!Number.isFinite(value) || value <= 0) return '—';
  if (value < 1_000) return String(Math.round(value));
  if (value < 1_000_000) return `${Math.round(value / 1_000)}k`;
  return `${Math.round(value / 1_000_000)}M`;
}
