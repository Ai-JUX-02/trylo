import type { Envelope, TerminalReason } from "../../protocol/envelope.js";
import { TERMINAL_REASONS } from "../../protocol/envelope.js";

/**
 * ag-ui 需要的 materialized state（截至某个 sequence 的聚合对象）。
 *
 * 为什么需要它：ag-ui 依赖 `STATE_SNAPSHOT`，而 Trylo 的 journal 是
 * append-only 事件流，**没有** materialized state 通道（D5 §8 第 5 条）。
 * WP §4 P3 允许本包用「截至该 sequence 的聚合对象」当 snapshot 值，
 * 但**禁止为此改 journal**。所以聚合态活在这里，是一个纯函数的累积结果：
 * `applyAguiState(state, envelope) → nextState`，没有 IO、没有全局变量。
 *
 * 刻意保持**有界**：字段全是标量，唯一的容器 `kindCounts` 的键上限就是
 * `EVENT_KINDS` 的长度（27）。不累积消息正文、不累积 id 列表——那样会随会话
 * 长度无界增长，而且会把可重建性变成「必须按同样顺序重放全部历史」的隐性要求。
 *
 * `parentRunId` 之类血缘字段**不在**这里：Trylo 没有这项事实，聚合态也不许虚构。
 */

export type AguiMaterializedState = {
  readonly eventCount: number;
  readonly kindCounts: Readonly<Record<string, number>>;
  readonly textChars: number;
  readonly thinkingChars: number;
  readonly toolCallCount: number;
  readonly lastTerminalReason: string | null;
  readonly lastEventId: string | null;
};

export function createAguiState(): AguiMaterializedState {
  return {
    eventCount: 0,
    kindCounts: {},
    textChars: 0,
    thinkingChars: 0,
    toolCallCount: 0,
    lastTerminalReason: null,
    lastEventId: null,
  };
}

/**
 * 把一条**已进场**的 envelope 累积进聚合态。纯函数：返回新对象，不改入参。
 *
 * 只有四类字段被记账，且全部可从 envelope 自身重算：
 * 事件计数、按 kind 的计数、文本/思考字符数、工具调用次数、最后一个终态原因。
 */
export function applyAguiState(
  state: AguiMaterializedState,
  envelope: Envelope,
): AguiMaterializedState {
  return {
    eventCount: state.eventCount + 1,
    kindCounts: {
      ...state.kindCounts,
      [envelope.kind]: (state.kindCounts[envelope.kind] ?? 0) + 1,
    },
    textChars: state.textChars + payloadTextLength(envelope, "text"),
    thinkingChars: state.thinkingChars + payloadTextLength(envelope, "thinking"),
    toolCallCount: state.toolCallCount + (envelope.kind === "tool_use" ? 1 : 0),
    lastTerminalReason: terminalReasonOf(envelope) ?? state.lastTerminalReason,
    lastEventId: envelope.eventId,
  };
}

function payloadTextLength(envelope: Envelope, kind: string): number {
  if (envelope.kind !== kind) {
    return 0;
  }
  const text = envelope.payload.text;
  return typeof text === "string" ? text.length : 0;
}

function terminalReasonOf(envelope: Envelope): TerminalReason | undefined {
  if (envelope.kind !== "terminal") {
    return undefined;
  }
  const reason = envelope.payload.reason;
  return typeof reason === "string" && isTerminalReason(reason) ? reason : undefined;
}

/**
 * 值守卫，和 `protocol/terminal.ts` 的 `readTerminalReason` 不是同一件事：
 * 后者的入参是 **Envelope 且要求 kind === "terminal"**，这里要判的是一个
 * payload 字段是不是合法终态值（`session_end` / `loop_end` 的 `reason` 也会用它）。
 * 两者语义不同，所以不合并、也不复制对方的实现。
 */
export function isTerminalReason(value: unknown): value is TerminalReason {
  return (
    typeof value === "string" && (TERMINAL_REASONS as readonly string[]).includes(value)
  );
}
