import { describe, expect, it } from 'vitest';
import { normalizeWorkspaceHistory } from '../../host-adapter/conversation-history';
import { normalizeMessageIds } from './message-identity';
import type { ChatMessage } from './types';

describe('message identity persistence boundary', () => {
  it('repairs duplicate user ids and keeps subsequent turn references attached', () => {
    const messages: ChatMessage[] = [
      { id: 'user', kind: 'text', role: 'user', text: 'first', createdAt: 1 },
      { id: 'a', kind: 'text', role: 'assistant', text: 'one', createdAt: 2, turnId: 'user' },
      { id: 'user', kind: 'text', role: 'user', text: 'second', createdAt: 3 },
      { id: 'b', kind: 'text', role: 'assistant', text: 'two', createdAt: 4, turnId: 'user' },
    ];
    const normalized = normalizeMessageIds(messages);
    expect(normalized[0]!.id).not.toBe(normalized[2]!.id);
    expect(normalized[1]!.turnId).toBe(normalized[0]!.id);
    expect(normalized[3]!.turnId).toBe(normalized[2]!.id);
    expect(normalizeMessageIds(normalized)).toEqual(normalized);
  });

  it('drops invalid stream receipts while keeping the message readable', () => {
    const raw = { conversations: { chat: {
      session: { id: 'chat', kind: 'code', mode: 'agent', createdAt: 1, title: 'chat' },
      messages: [{ id: 'a', kind: 'text', role: 'assistant', text: 'answer', createdAt: 2,
        streamSource: { blockId: 42, firstSeq: 'broken', lastSeq: null, firstTs: -1, lastTs: 0 } }],
    } } };
    const message = normalizeWorkspaceHistory(raw).conversations.chat!.messages[0]!;
    expect(message.streamSource).toBeUndefined();
    expect(message).toMatchObject({ id: 'a', kind: 'text', text: 'answer' });
  });
});
