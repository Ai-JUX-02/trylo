/**
 * Verification Authority 模块的公开面。
 *
 * 分权是显式的（WP-F §5 / §7 D1.4）：
 * - 读侧（`VerificationAuthorityReader`）只有 `verify(reference, expected)`；
 * - 写侧（`VerificationAuthorityWriter`）只有 `issue` / `revoke`，由 verifier 组合
 *   持有，`integration/**`、Board reducer 与 tooling production search 都不得 import。
 *
 * 本文件导出合同与纯校验；具体持久实现位于
 * `internal/adapters/verification-authority-store`（不得反向依赖本模块之外的上层）。
 */

export {
  AGENT_METHOD_SUBJECT_KIND,
  RECEIPT_FAILURE_CODES,
  RECEIPT_ISSUANCE_FAILURE_CODES,
  RECEIPT_SUBJECT_KINDS,
  USER_EXPLICIT_SOURCE_PREFIXES,
  USER_EXPLICIT_SUBJECT_KIND,
  VERIFICATION_AUTHORITY_FORMAT_VERSION,
  VERIFICATION_DOMAINS,
  VERIFICATION_VERDICTS,
} from "./contracts.js";

export type {
  ReceiptExpectation,
  ReceiptFailureCode,
  ReceiptIssuanceFailureCode,
  ReceiptIssuanceInput,
  ReceiptIssuanceResult,
  ReceiptReference,
  ReceiptRevocationResult,
  ReceiptSubjectKind,
  ReceiptVerificationResult,
  VerificationAuthorityReader,
  VerificationAuthorityRegistry,
  VerificationAuthorityWriter,
  VerificationDomain,
  VerificationReceipt,
  VerificationSubject,
  VerificationVerdict,
} from "./contracts.js";

export {
  hasExactKeys,
  isNonEmptyString,
  isPlainRecord,
  isReceiptSubjectKind,
  isVerificationDomain,
  isVerificationVerdict,
  parseVerificationReceipt,
  unknownKeys,
} from "./parse.js";

export type { ReceiptParse, ReceiptParseFailure } from "./parse.js";

export { checkReceiptBinding } from "./binding.js";
export type { BindingCheck } from "./binding.js";

export { checkIssuance, receiptFromDraft } from "./issuance.js";
export type { IssuanceCheck, IssuanceDraft } from "./issuance.js";

export {
  checkValidationRecord,
  deriveChecksDigest,
  deriveSourceDigest,
} from "./validation-record.js";
export type { ValidationRecordCheck } from "./validation-record.js";
