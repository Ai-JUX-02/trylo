export const EXECUTION_ERROR_CODES = [
  "illegal_transition",
  "invalid_input",
  "payload_too_large",
  "overflow",
  "unknown_outcome",
] as const;

export type ExecutionErrorCode = (typeof EXECUTION_ERROR_CODES)[number];

export type ExecutionError = {
  readonly code: ExecutionErrorCode;
  readonly message: string;
  readonly from?: string;
  readonly event?: string;
};
