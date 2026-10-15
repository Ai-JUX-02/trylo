// Round-3 (P0-5): the interrupted turn must stay ONE turn.
//
// Window evidence: the guidance bubble landed in the transcript and every
// assistant/tool row after it was stamped `turnId=user-musxfsrm` — the
// guidance's own id — while `results.code.latestRun.meta.turnId` kept saying
// `user-musx5hbs`. Two records, two answers to "which turn is this?". It also
// pushed `session.turnCount` from 1 to 2, so a guidance that never reached the
// CLI read back as a whole extra user turn (this is P0-1c 轮次计数诚实性
// reopened from the steering path).
//
// The split is not the projector's doing: `turnId` on generated rows comes
// from `lastUserIndex` (events.ts) = "the id of the last USER row in the
// array". Once a guidance bubble exists, everything after inherits its id
// whether or not the CLI ever saw the text — so that migration is NOT usable
// as evidence of acceptance either. The honest fix is to stop treating a
// guidance as a turn: keep it visible, mark it, exclude it from both the
// boundary and the count.
import { describe, expect, it } from 'vitest';
import { lastUserIndex } from './message-identity';
import {
  createConversation,
  emptyWorkspaceHistory,
  updateConversationMessages,
} from '../../host-adapter/conversation-history';
import type { ChatMessage } from './types';

function user(id: string, text: string): ChatMessage {
  return { id, kind: 'text', role: 'user', createdAt: 1, text };
}

function steer(id: string, text: string, steerState: 'delivered' | 'failed'): ChatMessage {
  return { id, kind: 'text', role: 'user', createdAt: 2, text, steerState };
}

function assistant(id: string, turnId: string): ChatMessage {
  return { id, kind: 'text', role: 'assistant', createdAt: 3, text: 'ok', turnId };
}

describe('a mid-run guidance is an intervention, not a turn', () => {
  it('never becomes the turn boundary, even as the newest user row', () => {
    const msgs = [
      user('u-orig', '原任务'),
      assistant('a1', 'u-orig'),
      steer('u-steer', '停止重复运行同一条命令', 'failed'),
      assistant('a2', 'u-steer'),
    ];
    // Rows generated after the guidance belong to the ORIGINAL turn, which is
    // exactly what the run ledger (`meta.turnId`) says too.
    expect(msgs[lastUserIndex(msgs)]?.id).toBe('u-orig');
  });

  it('finds no boundary when only guidance rows exist', () => {
    expect(lastUserIndex([steer('u-steer', 'stop', 'delivered')])).toBe(-1);
  });

  it('keeps session.turnCount at ONE for the whole interrupted turn', () => {
    const base = emptyWorkspaceHistory();
    const { history, session } = createConversation(base, { kind: 'code' });
    const withTurn = updateConversationMessages(history, session.id, [user('u-orig', '原任务')]);
    const interrupting = updateConversationMessages(withTurn, session.id, (prev) => [
      ...prev,
      steer('u-steer', '停止重复运行同一条命令', 'failed'),
      assistant('a1', 'u-orig'),
    ]);
    // One real turn + one intervention = 1, not 2. The rejected guidance is
    // still visible in the transcript (this test reads the message list, not
    // a projection of it) — it simply no longer poses as a user turn.
    expect(interrupting.conversations[session.id]!.session.turnCount).toBe(1);
    expect(interrupting.conversations[session.id]!.messages).toHaveLength(3);
    // A NEW genuine user message still counts.
    const realSecondTurn = updateConversationMessages(interrupting, session.id, (prev) => [
      ...prev,
      user('u-next', '下一轮'),
    ]);
    expect(realSecondTurn.conversations[session.id]!.session.turnCount).toBe(2);
  });
});
