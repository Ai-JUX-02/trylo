import type { ExecutionError } from "../contract/error.js";
import type {
  Approval,
  Attempt,
  ToolCall,
  Verification,
} from "../contract/execution.js";
import type { TerminalReason } from "../protocol/envelope.js";

export type PhaseName =
  | "idle"
  | "turning"
  | "streaming"
  | "tooling"
  | "approval_waiting"
  | "terminal";

export type ExecutionState = {
  readonly phase: PhaseName;
  readonly terminalReason?: TerminalReason;
  readonly sessionId?: string;
  readonly turnId?: string;
  readonly correlationId?: string;
  readonly currentAttemptId?: string;
  readonly streamIndex: number;
  readonly attempts: readonly Attempt[];
  readonly activeToolCallId?: string;
  /**
   * Every tool call in flight when parallelism is open (WP D 波 §5.1). Absent
   * means the single-call shape, and every batch function treats an absent set
   * as a no-op — which is what lets "parallel off" stay byte for byte identical.
   */
  readonly activeToolCallIds?: readonly string[];
  readonly toolCalls: Readonly<Record<string, ToolCall>>;
  readonly approvals: Readonly<Record<string, Approval>>;
  readonly verification: Verification;
  readonly seenEventIds: readonly string[];
  /** Journal deliveries need a watermark, rather than a turn-wide id array. */
  readonly lastDeliverySequence?: number;
  readonly lastError?: ExecutionError;
  /**
   * Tool input blocks that started but were never closed by a `tool_call`.
   * Non-empty at `finish` time means the stream was truncated, which must not
   * be reported as a successful completion.
   */
  readonly openToolInputIds: readonly string[];
  /** Unified finish reason of the most recent stream, empty if none. */
  readonly finishReason: string;
  /** Provider contract demands another request even with no tool results. */
  readonly requiresFollowUp: boolean;
};

export const MAX_SEEN_EVENTS = 4096;
export const MAX_ATTEMPTS = 3;


export function initialState(): ExecutionState {
  return {
    phase: "idle",
    streamIndex: 0,
    attempts: [],
    toolCalls: {},
    approvals: {},
    verification: { status: "unset" },
    seenEventIds: [],
    openToolInputIds: [],
    finishReason: "",
    requiresFollowUp: false,
  };
}

export function attemptIdFor(turnId: string, index: number): string {
  return `att-${turnId}-${index}`;
}

export function ticketIdFor(toolCallId: string): string {
  return `tkt-${toolCallId}`;
}
