import type { ChatMessage, TextMessage, ThinkingMessage } from './types';
import type { TextEvent, ThinkingEvent } from '../../host-adapter/loop-events';
import { eventMessageId, findStreamMessage, lastUserIndex, streamSource } from './message-identity';
import { freezeTurnTimer, hasAssistantOutputInTurn } from './turn-timer';

function mergeSnapshot(previous: string, incoming: string, partial: boolean): string {
  if (!partial || previous.length === 0) return incoming;
  if (incoming.startsWith(previous)) return incoming;
  if (previous.startsWith(incoming)) return previous;
  return incoming.length >= previous.length ? incoming : previous;
}

function isStale(message: TextMessage | ThinkingMessage, event: TextEvent | ThinkingEvent): boolean {
  if (message.partial === false && event.partial === true) return true;
  const source = message.streamSource;
  return source !== undefined && event.seq <= source.lastSeq && event.ts <= source.lastTs;
}

function adjacentThinking(messages: readonly ChatMessage[], boundary: number): number {
  for (let index = messages.length - 1; index > boundary; index--) {
    const message = messages[index];
    if (message?.kind === 'thinking') return index;
    if (message?.kind === 'tool' || message?.kind === 'text') break;
  }
  return -1;
}

export function applyThinking(messages: ChatMessage[], event: ThinkingEvent): ChatMessage[] {
  if (!(event.preview || event.summary).trim()) return messages;
  const boundary = lastUserIndex(messages);
  let index = findStreamMessage(messages, event);
  if (index < 0 && event.blockId === undefined) index = adjacentThinking(messages, boundary);
  const previous = messages[index];
  if (previous?.kind === 'thinking') {
    if (isStale(previous, event)) return messages;
    const updated: ThinkingMessage = {
      ...previous,
      summary: mergeSnapshot(previous.summary, event.summary, event.partial === true),
      preview: mergeSnapshot(previous.preview, event.preview, event.partial === true),
      fullLength: Math.max(previous.fullLength, event.fullLength),
      partial: event.partial === true,
      streamSource: streamSource(event, previous.streamSource),
    };
    return messages.map((message, position) => position === index ? updated : message);
  }
  const next = hasAssistantOutputInTurn(messages, boundary)
    ? messages : freezeTurnTimer(messages, boundary, event.ts);
  return [...next, {
    id: eventMessageId(messages, event, 'thinking'),
    phaseId: eventMessageId(messages, event, 'phase'),
    kind: 'thinking', role: 'assistant', createdAt: event.ts,
    summary: event.summary, preview: event.preview, fullLength: event.fullLength,
    partial: event.partial === true, turn: event.turn,
    turnId: messages[boundary]?.id, streamSource: streamSource(event),
  }];
}

export function applyText(messages: ChatMessage[], event: TextEvent): ChatMessage[] {
  const text = event.fullText ?? event.preview;
  if (!text.trim()) return messages;
  const boundary = lastUserIndex(messages);
  let index = findStreamMessage(messages, event);
  if (index < 0 && event.blockId === undefined) {
    for (let position = messages.length - 1; position > boundary; position--) {
      const message = messages[position];
      if (message?.kind === 'text' && message.role === 'assistant' && !message.frozen) {
        index = position;
        break;
      }
    }
  }
  const previous = messages[index];
  if (previous?.kind === 'text') {
    if (isStale(previous, event)) return messages;
    const updated: TextMessage = { ...previous,
      text: mergeSnapshot(previous.text, text, event.partial === true),
      partial: event.partial === true, streamSource: streamSource(event, previous.streamSource),
    };
    return messages.map((message, position) => position === index ? updated : message);
  }
  const next = hasAssistantOutputInTurn(messages, boundary)
    ? messages : freezeTurnTimer(messages, boundary, event.ts);
  return [...next, {
    id: eventMessageId(messages, event, 'text'), kind: 'text', role: 'assistant',
    createdAt: event.ts, text, partial: event.partial === true,
    turnId: messages[boundary]?.id, streamSource: streamSource(event),
  }];
}
