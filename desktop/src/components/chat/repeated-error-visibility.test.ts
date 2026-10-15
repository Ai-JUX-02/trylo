import { describe, expect, it } from 'vitest';
import { applyEvents } from './events';
import { normalizeMessageIds } from './message-identity';
import { normalizeWorkspaceHistory } from '../../host-adapter/conversation-history';
import type { ChatMessage } from './types';

// Round-3 P0-7 EVIDENCE LOCK. The acceptance run (session
// code-musy5wnw-sz4xu) produced two byte-identical notices whose ids differ
// (`warn-1791065346302-0` / `warn-1791065419317-0`, 73s apart). Every layer
// below is asserted to PRESERVE both. This file exists so the day someone
// "fixes" the duplicate by text, this goes red instead of shipping a
// silenced error.
const TEXT = 'session desktop-5cfca959 cannot be continued: model changed: '
  + 'grok-4.5 -> DeepSeek-V4-Flash-Vision-Exp | start a new session instead; '
  + 'resuming would reinterpret the stored transcript';

function notice(id: string, createdAt: number) {
  return { type: 'runtime_warning' as const, id, seq: 0, ts: createdAt,
    code: 'session_model_changed', message: TEXT };
}

describe('P0-7 evidence lock: a repeated error must stay reported', () => {
  it('keeps both identical-text notices through the real write pipeline', () => {
    let msgs: ChatMessage[] = [];
    const send = (uid: string, ts: number, warnId: string) => {
      msgs = normalizeMessageIds(applyEvents(msgs, [
        { type: 'text', seq: 1, ts, turn: 1, blockId: `b-${uid}`, fullText: 'task', preview: 'task' },
      ]) as ChatMessage[]) as ChatMessage[];
      msgs = normalizeMessageIds(applyEvents(msgs, [notice(warnId, ts + 5)]) as ChatMessage[]) as ChatMessage[];
      msgs = normalizeMessageIds(applyEvents(msgs, [
        { type: 'turn_end', seq: 2, ts: ts + 6, turn: 1, stopReason: 'failed',
          usage: { input_tokens: 0, output_tokens: 0 } },
      ]) as ChatMessage[]) as ChatMessage[];
    };
    send('musy262h', 1791065341241, 'warn-1791065346302-0');
    send('musy3odr', 1791065411631, 'warn-1791065419317-0');

    const notices = msgs.filter(m => m.kind === 'notice');
    expect(notices).toHaveLength(2);
    expect(new Set(notices.map(n => n.id)).size).toBe(2);
    // Both carry the SAME text — the case a text-dedupe would collapse.
    expect(new Set(notices.map(n => (n.kind === 'notice' ? n.text : ''))).size).toBe(1);
  });

  it('survives the persisted-history normalizer (the切走切回来 path)', () => {
    const messages: ChatMessage[] = [
      { id: 'user-musy262h', role: 'user', kind: 'text', text: 'task', createdAt: 1791065341241 },
      { id: 'warn-1791065346302-0', role: 'system', kind: 'notice', text: TEXT, createdAt: 1791065346302 },
      { id: 'user-musy3odr', role: 'user', kind: 'text', text: '你好', createdAt: 1791065411631 },
      { id: 'warn-1791065419317-0', role: 'system', kind: 'notice', text: TEXT, createdAt: 1791065419317 },
    ];
    const history = normalizeWorkspaceHistory({ conversations: { chat: {
      session: { id: 'chat', kind: 'code', mode: 'code', title: 'Chat',
        createdAt: 1, updatedAt: 1791065419317, turnCount: 2 },
      messages,
    } } });
    const out = history.conversations.chat!.messages;
    expect(out.filter(m => m.kind === 'notice')).toHaveLength(2);
    expect(new Set(out.map(m => m.id)).size).toBe(4);
  });

  it('replays the real on-disk three-failure run: mixed id shapes, all preserved', () => {
    // Shapes copied from Temp/desktop-native-proof-20261003 conversation
    // code-musxwu3m-mn0bb (session desktop-5cfca959…):
    //  - turn 1: provider refused in-run → warn:<sid>:<tid>:<seq> + turn with
    //    usage 0/0 under the OLD stopReason encoding (`tool_use`);
    //  - turns 2-3: resume refused in prepare → warn-<ts>-<seq> + turn with
    //    NO usage frame at all.
    const sid = 'desktop-5cfca959-6d4f-4d57-8350-f42de6d1876c';
    let msgs: ChatMessage[] = [];
    const user = (id: string, ts: number, text: string): ChatMessage =>
      ({ id, role: 'user', kind: 'text', text, createdAt: ts });
    msgs = normalizeMessageIds(applyEvents(msgs, [
      { type: 'runtime_warning', id: `warn:${sid}:turn-c90f6c16-51c3-49cf-9a00-7649e9301a6f:2`,
        seq: 2, ts: 1791065202857, code: 'invalid_request',
        message: 'check --model, the endpoint and the request options' },
    ]) as ChatMessage[]) as ChatMessage[];
    msgs = normalizeMessageIds(applyEvents([user('user-musxz3cd', 1791065197741, 'task'), ...msgs], [
      { type: 'turn_end', seq: 3, ts: 1791065202859, turn: 1, stopReason: 'tool_use',
        usage: { input_tokens: 0, output_tokens: 0 } },
    ]) as ChatMessage[]) as ChatMessage[];
    for (const [uid, ts, wid] of [
      ['user-musy262h', 1791065341241, 'warn-1791065346302-0'],
      ['user-musy3odr', 1791065411631, 'warn-1791065419317-0'],
    ] as const) {
      msgs = [...msgs, user(uid, ts, uid === 'user-musy3odr' ? '你好' : 'task')];
      msgs = normalizeMessageIds(applyEvents(msgs, [
        { type: 'runtime_warning', id: wid, seq: 0, ts: ts + 5061,
          code: 'session_model_changed', message: TEXT },
      ]) as ChatMessage[]) as ChatMessage[];
      msgs = normalizeMessageIds(applyEvents(msgs, [
        { type: 'turn_end', seq: 1, ts: ts + 5061, turn: 1, stopReason: 'failed' },
      ]) as ChatMessage[]) as ChatMessage[];
    }
    const notices = msgs.filter(m => m.kind === 'notice');
    expect(notices).toHaveLength(3);
    expect(new Set(notices.map(n => n.id)).size).toBe(3);
    // The two resume failures (new `failed` encoding, no usage, no answer)
    // must read as unfinished, never as done.
    const turns = msgs.filter(m => m.kind === 'turn');
    expect(turns).toHaveLength(3);
    const resumeTurns = turns.slice(1);
    for (const t of resumeTurns) {
      expect(t.kind).toBe('turn');
      if (t.kind === 'turn') {
        expect(t.status).toBe('error');
        expect(t.incomplete).toBe(true);
      }
    }
  });
});
