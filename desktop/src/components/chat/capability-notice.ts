import type { ChatMessage } from './types';

/** Configuration evidence belongs once in a chat. This recognizes only the
 * Work send gate's informational notice; user text, blocked requests and
 * runtime/tool failures must remain distinct even when their text matches. */
export function dedupeCapabilityNotices(messages: readonly ChatMessage[]): readonly ChatMessage[] {
  const seen = new Set<string>();
  let changed = false;
  const filtered = messages.filter(message => {
    if (message.kind !== 'notice' || message.role !== 'system'
      || !message.id.startsWith('work-cap-')
      || !message.text.startsWith('本次运行缺少可选工具：')) return true;
    if (!seen.has(message.text)) {
      seen.add(message.text);
      return true;
    }
    changed = true;
    return false;
  });
  return changed ? filtered : messages;
}
