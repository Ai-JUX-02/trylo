import type { JsonObject } from "../protocol/envelope.js";
import type { TerminalReason } from "../protocol/envelope.js";

export type MessageRole = "user" | "assistant" | "tool" | "system";

export type Message = {
  readonly role: MessageRole;
  readonly content: string;
  readonly toolCallId?: string;
};

export type AttemptStatus = "active" | "superseded" | "terminal";

export type Attempt = {
  readonly attemptId: string;
  readonly index: number;
  readonly status: AttemptStatus;
};

export type Turn = {
  readonly turnId: string;
  readonly sessionId: string;
  readonly correlationId: string;
  readonly attempts: readonly Attempt[];
};

export type ToolCallStatus =
  | "requested"
  | "awaiting_permission"
  | "executing"
  | "succeeded"
  | "failed"
  | "unknown"
  | "denied"
  | "permission_failed"
  | "cancelled";

export type ToolCall = {
  readonly toolCallId: string;
  readonly name: string;
  readonly arguments: JsonObject;
  readonly status: ToolCallStatus;
};

export type ApprovalStatus =
  | "requested"
  | "approved"
  | "denied"
  | "cancelled"
  | "expired"
  | "failed";

export type Approval = {
  readonly ticketId: string;
  readonly toolCallId: string;
  readonly status: ApprovalStatus;
};

export type VerificationStatus = "unset" | "pass" | "fail" | "partial";

export type Verification = {
  readonly status: VerificationStatus;
  readonly checkId?: string;
};

export type { TerminalReason };
