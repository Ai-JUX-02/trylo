import type { Envelope } from "./envelope.js";

export type ValidateFailureCode =
  | "invalid_json"
  | "not_object"
  | "missing_event_id"
  | "missing_sequence"
  | "invalid_protocol_version"
  | "invalid_timestamp"
  | "invalid_kind"
  | "invalid_payload"
  | "payload_too_large"
  | "invalid_producer"
  | "invalid_optional_id"
  | "invalid_sequence"
  | "not_terminal";

export type ValidateOk = {
  readonly ok: true;
  readonly envelope: Envelope;
};

export type ValidateErr = {
  readonly ok: false;
  readonly code: ValidateFailureCode;
};

export type ValidateResult = ValidateOk | ValidateErr;
