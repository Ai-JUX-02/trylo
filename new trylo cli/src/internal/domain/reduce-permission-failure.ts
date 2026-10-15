import type { ExecutionState } from "./state.js";
import { ticketIdFor } from "./state.js";
import {
  clearOptional,
  emit,
  fail,
  markAttemptTerminal,
  ok,
  remember,
  type ReduceResult,
} from "./reduce-helpers.js";

export function failPermission(
  state: ExecutionState,
  eventId: string,
  expectedId: string,
  gotId: string,
  message: string,
): ReduceResult {
  if (expectedId !== gotId) {
    return fail(state, {
      code: "invalid_input",
      message: "permission_tool_mismatch",
      from: state.phase,
      event: "permission_failed",
    });
  }
  const call = state.toolCalls[expectedId];
  if (call === undefined) {
    return fail(state, {
      code: "invalid_input",
      message: "unknown_tool_call",
      from: state.phase,
      event: "permission_failed",
    });
  }
  const ticketId = ticketIdFor(expectedId);
  const remembered = remember(state, eventId);
  const next: ExecutionState = {
    ...clearOptional(remembered, ["activeToolCallId"]),
    phase: "terminal",
    terminalReason: "failed",
    approvals: {
      ...remembered.approvals,
      [ticketId]: { ticketId, toolCallId: expectedId, status: "failed" },
    },
    toolCalls: {
      ...remembered.toolCalls,
      [expectedId]: { ...call, status: "permission_failed" },
    },
    attempts: markAttemptTerminal(remembered),
  };
  return ok(next, [
    emit(
      "error",
      { code: "permission_unavailable", toolCallId: expectedId, message },
      eventId,
    ),
    emit(
      "terminal",
      { reason: "failed", cause: "permission_unavailable" },
      `${eventId}:term`,
    ),
  ]);
}
