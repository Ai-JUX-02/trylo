import type { ChatMessage, ToolMessage } from './types';

// Unchanged replay pairs must keep object identity across streaming renders;
// otherwise historical phase memoization fails and scrolling gets expensive.
const mergedReceipts = new WeakMap<ToolMessage, WeakMap<ToolMessage, ToolMessage>>();
function mergeReceipt(previous: ToolMessage, incoming: ToolMessage): ToolMessage {
  let byIncoming = mergedReceipts.get(previous);
  if (!byIncoming) { byIncoming = new WeakMap(); mergedReceipts.set(previous, byIncoming); }
  const cached = byIncoming.get(incoming);
  if (cached) return cached;
  const merged = { ...previous, ...incoming, id: previous.id, phaseId: previous.phaseId };
  byIncoming.set(incoming, merged);
  return merged;
}

/** Within one user turn, merge receipts only by invocation identity.
 * Preserve first position, and keep distinct calls of identical commands. */
export function coalesceToolReplays(messages: readonly ChatMessage[]): readonly ChatMessage[] {
  const positions = new Map<string, number>();
  const result: ChatMessage[] = [];
  let changed = false;
  for (const message of messages) {
    if (message.kind !== 'tool' || !message.toolCallId) { result.push(message); continue; }
    const key = `${message.tool}\0${message.toolCallId}`;
    const position = positions.get(key);
    if (position === undefined) {
      positions.set(key, result.length);
      result.push(message);
      continue;
    }
    changed = true;
    const previous = result[position] as ToolMessage;
    const settled = (tool: ToolMessage) => tool.status !== 'running' && tool.status !== 'pending';
    if (!settled(previous) || settled(message)) {
      result[position] = mergeReceipt(previous, message);
    }
  }
  return changed ? result : messages;
}
