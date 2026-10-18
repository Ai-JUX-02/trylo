import { describe, expect, it } from 'vitest';
import { applyEvents } from './events';
import type { ChatMessage } from './types';
import { normalizeWorkspaceHistory } from '../../host-adapter/conversation-history';
import { TryloV1EventAdapter } from '../../host-adapter/trylo-v1-event-adapter';

describe('runtime warning identity across one-shot runs', () => {
  it('keeps warnings from different runs distinct even when seq and timestamp match', () => {
    const warning = { type: 'runtime_warning' as const, seq: 7, ts: 100,
      code: 'denied', message: 'You declined this call; it did not run.' };
    const messages = applyEvents([], [
      { ...warning, id: 'warn:session:turn-a:7' },
      { ...warning, id: 'warn:session:turn-b:7' },
    ]);
    expect(new Set(messages.map(message => message.id)).size).toBe(2);
    expect(messages).toHaveLength(2);
  });

  it('does not append a redelivered warning twice', () => {
    const warning = { type: 'runtime_warning' as const, seq: 7, ts: 100,
      code: 'denied', message: 'Denied', id: 'warn:session:turn-a:7' };
    expect(applyEvents(applyEvents([], [warning]), [warning])).toHaveLength(1);
  });

  it('keeps one degraded notice per noticeId even when a later turn redelivers it', () => {
    // WP-CL / A11: the CLI makes `noticeId` stable across processes. The event
    // id is per turn, so two turns carrying the same degradation produce two
    // different ids — the notice must still render once.
    const diagnostic = { schemaVersion: 1 as const, cause: 'binding_mismatch' as const, affected: 2,
      basis: 'native_expected_occurrences' as const, severity: 'degraded' as const, noticeId: 'notice-a' };
    const messages = applyEvents([], [
      { type: 'runtime_warning', seq: 3, ts: 100, id: 'warn:s:turn-a:3', code: 'native_continuation_unavailable',
        message: '部分历史的模型续接数据无法恢复（2 条），本轮将使用可见对话继续。', diagnostic },
      { type: 'runtime_warning', seq: 4, ts: 200, id: 'warn:s:turn-b:4', code: 'native_continuation_unavailable',
        message: '部分历史的模型续接数据无法恢复（2 条），本轮将使用可见对话继续。', diagnostic },
    ]);
    expect(messages).toHaveLength(1);
    expect(messages[0]).toMatchObject({ kind: 'notice', noticeId: 'notice-a' });
  });

  it('still shows two notices when the same words describe a different degradation', () => {
    const base = { schemaVersion: 1 as const, cause: 'binding_mismatch' as const, affected: 2,
      basis: 'native_expected_occurrences' as const, severity: 'degraded' as const };
    const messages = applyEvents([], [
      { type: 'runtime_warning', seq: 3, ts: 100, id: 'warn:s:turn-a:3', code: 'native_continuation_unavailable',
        message: '部分历史的模型续接数据无法恢复（2 条），本轮将使用可见对话继续。',
        diagnostic: { ...base, noticeId: 'notice-a' } },
      { type: 'runtime_warning', seq: 4, ts: 200, id: 'warn:s:turn-b:4', code: 'native_continuation_unavailable',
        message: '部分历史的模型续接数据无法恢复（2 条），本轮将使用可见对话继续。',
        diagnostic: { ...base, noticeId: 'notice-b' } },
    ]);
    expect(messages).toHaveLength(2);
  });

  it('uses the canonical session and turn to scope adapter warning ids', () => {
    const adapter = new TryloV1EventAdapter();
    adapter.feed(JSON.stringify({ type: 'run_start', sessionId: 'session',
      turnId: 'turn-a', providerId: 'fixture', model: 'fixture' }));
    expect(adapter.warn('denied', 'Denied')).toMatchObject({ id: 'warn:session:turn-a:2' });
  });

  it('repairs old persisted keys without dropping genuine notices and is stable on reload', () => {
    const messages: ChatMessage[] = [
      { id: 'warn-7', role: 'system', kind: 'notice', text: 'Denied', createdAt: 100 },
      { id: 'warn-7', role: 'system', kind: 'notice', text: 'Checkpoint', createdAt: 200 },
      { id: 'warn-7', role: 'system', kind: 'notice', text: 'Another event', createdAt: 200 },
      { id: 'user-1', role: 'user', kind: 'text', text: 'Hello', createdAt: 300 },
    ];
    const history = normalizeWorkspaceHistory({ conversations: { chat: {
      session: { id: 'chat', kind: 'code', mode: 'code', title: 'Chat',
        createdAt: 1, updatedAt: 300, turnCount: 1 }, messages,
    } } });
    const repaired = history.conversations.chat!.messages;
    expect(new Set(repaired.map(message => message.id)).size).toBe(4);
    expect(repaired.map(message => message.kind === 'notice' || message.kind === 'text'
      ? message.text : '')).toEqual(['Denied', 'Checkpoint', 'Another event', 'Hello']);
    expect(normalizeWorkspaceHistory(history).conversations.chat!.messages).toEqual(repaired);
  });
});
