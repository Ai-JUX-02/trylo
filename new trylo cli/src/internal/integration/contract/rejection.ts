/**
 * 跨包 adapter 的统一失败合同。
 *
 * 设计约束：adapter 只能返回显式判别联合，禁止 throw 作为普通业务分支；
 * 调用方必须能在不捕获异常的前提下穷举处理每个 reason。
 */

export const MAPPING_FAILURE_REASONS = [
  "unknown_source_kind",
  "missing_admission",
  "invalid_admission",
  "not_a_draft",
  "missing_scope",
  "authority_claim_present",
  "permission_language_present",
  "missing_verifier",
  "insufficient_attribution",
  "missing_base_version",
  "kind_mismatch",
  "summary_as_provenance",
  "generator_is_evaluator",
  "missing_replay",
  "missing_observation_link",
  "missing_version_link",
  "missing_verification_ref",
  "missing_task_family",
  "missing_reason",
  "missing_summary",
  "license_not_admissible",
  "identity_unverified",
  "reference_only_source",
  "authority_mismatch",
  "missing_causal_refs",
  "invalid_timestamp",
  "observation_contradiction",
  "invalid_observation",
  "invalid_gap",
  "invalid_activation",
  "missing_asset_link",
  "duplicate_activation_key",
  "stale_sequence",
  "missing_package_version",
  "verification_authority_unavailable",
  "verification_receipt_unavailable",
  "verification_binding_mismatch",
  "verification_verdict_rejected",
  "unresolvable_withdraw_target",
] as const;

export type MappingFailureReason = (typeof MAPPING_FAILURE_REASONS)[number];

export type MappingOk<T> = {
  readonly ok: true;
  readonly value: T;
};

export type MappingFailure = {
  readonly ok: false;
  readonly reason: MappingFailureReason;
  readonly detail: string;
};

export type MappingResult<T> = MappingOk<T> | MappingFailure;

export function mapped<T>(value: T): MappingOk<T> {
  return { ok: true, value };
}

export function rejected(
  reason: MappingFailureReason,
  detail: string,
): MappingFailure {
  return { ok: false, reason, detail };
}

/** adapter 允许产出的 Board 命令种类。此表是「不得生成 activate / 审批决定」的机器可执行形式。 */
export const ADAPTER_ALLOWED_COMMAND_TYPES = [
  "submit_proposal",
  "record_evidence",
  "enqueue_job",
  "suspend",
  "rollback",
  "tombstone",
] as const;

export type AdapterAllowedCommandType = (typeof ADAPTER_ALLOWED_COMMAND_TYPES)[number];

export function isAdapterAllowedCommandType(
  value: string,
): value is AdapterAllowedCommandType {
  return (ADAPTER_ALLOWED_COMMAND_TYPES as readonly string[]).includes(value);
}
