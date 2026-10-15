/**
 * Verification Authority：窄的可信证据地板（WP-F / D1）。
 *
 * 存在理由（外审 R2 的 P1-R1 / P1-R2）：在「调用方即攻击者」的威胁模型下，
 * 一份*结构完全自洽*的 `ValidationRecord` 或一个 `selfGenerated:false` 的
 * external anchor 都不构成独立证据——这些字段的值全部来自调用方，复制输出合同
 * 的成本接近零。因此独立证据的权威不能来自调用方提交的形状，只能来自
 * **调用方无法写入的权威侧持久事实**。
 *
 * 边界：
 *   独立 verifier / checker
 *     → authority writer 写入 durable receipt registry
 *     → 返回 opaque receiptRef
 *     → C/D adapter 只提交 receiptRef
 *     → trusted admission gateway 读回 registry 并核对 subject/version/scope/verdict/digest
 *     → 生成 canonical record_evidence command
 *     → Board reducer
 *
 * 这不是完整 Evidence Fabric：本模块只承载「验证收据」一种事实，不承载用户画像、
 * 学习工单、runtime dispatch、原始正文、secret、隐藏 reasoning 或完整工具输出。
 */

import type { ValidationRecord } from "../../tooling/contract/types.js";

/** 持久与 wire 格式版本。未知版本一律 fail closed，不做猜测式迁移。 */
export const VERIFICATION_AUTHORITY_FORMAT_VERSION = 1;

/**
 * `user_explicit` 域允许的事实引用前缀（WP-F §7 D3.3）。
 *
 * 只有执行环在真实执行当时按身份下落的记录、或用户显式输入的记录可以成为
 * 用户证据来源；普通 external verifier 不能借 `user_explicit` 域冒充用户明令。
 */
export const USER_EXPLICIT_SOURCE_PREFIXES = [
  "execution:",
  "user_explicit:",
] as const;

/** `agent_method` 域只接受工具包版本的独立验证。 */
export const AGENT_METHOD_SUBJECT_KIND = "tool_package_version" as const;

/** `user_explicit` 域只接受内容候选。 */
export const USER_EXPLICIT_SUBJECT_KIND = "content_candidate" as const;

/**
 * 证据域（外审 WP-F §5）：C 的「用户明令/执行绑定事实」与 D 的「Agent 方法验证」
 * 必须使用不同 domain，且不共享语义 payload。
 */
export const VERIFICATION_DOMAINS = ["agent_method", "user_explicit"] as const;

export type VerificationDomain = (typeof VERIFICATION_DOMAINS)[number];

export const VERIFICATION_VERDICTS = ["pass", "fail", "partial"] as const;

export type VerificationVerdict = (typeof VERIFICATION_VERDICTS)[number];

/**
 * 被验证对象种类。刻意保持极窄：只有「工具包版本」与「内容候选」两类主体
 * 可以携带独立验证收据；新增种类必须同时新增绑定规则与合同测试。
 */
export const RECEIPT_SUBJECT_KINDS = ["tool_package_version", "content_candidate"] as const;

export type ReceiptSubjectKind = (typeof RECEIPT_SUBJECT_KINDS)[number];

/** 收据绑定的主体坐标。四项全部参与核对，任一不符即拒绝。 */
export type VerificationSubject = {
  readonly subjectKind: ReceiptSubjectKind;
  readonly subjectId: string;
  /** proposal/asset 版本坐标；改写即 stale，必须重新验证。 */
  readonly subjectVersion: string;
  readonly scope: string;
};

/**
 * 一条已签发的验证收据。
 *
 * `generatorId !== verifierId` 只是**必要**条件，不是充分条件：真正的充分条件是
 * 这条收据确实存在于 authority registry 中且与本次 admission 的绑定完全一致。
 */
export type VerificationReceipt = {
  readonly formatVersion: typeof VERIFICATION_AUTHORITY_FORMAT_VERSION;
  readonly receiptId: string;
  readonly domain: VerificationDomain;
  readonly subject: VerificationSubject;
  readonly verifierId: string;
  readonly generatorId: string;
  readonly verdict: VerificationVerdict;
  /** 检查内容摘要（不含原始输出）。 */
  readonly checksDigest: string;
  /** 被验证来源摘要（不含原始内容）。 */
  readonly sourceDigest: string;
  readonly issuedAt: string;
  /** 收据在 registry 内的事件序号，用于审计回查。 */
  readonly sequence: number;
};

/**
 * 签发输入：由 verifier / checker composition 提供。
 *
 * 设计要点（外审 R2 §3.1 的根本关闭路径）：调用方**不提供** verdict、checksDigest、
 * sourceDigest——这三者都由 authority 从它自己校验过的事实派生。调用方能给的只有
 * 「哪一份记录 / 哪一个执行绑定事实」以及主体坐标。
 *
 * 两个 domain 的形状刻意不同，且不共享可通过的字段集合（WP-F §7 D1.5）：
 * - `agent_method` 必须携带结构完整的十段 `ValidationRecord`，verdict 由记录派生；
 * - `user_explicit` 必须携带执行当时落下的不可变事实引用，且 verdict 恒为 pass
 *   （用户明令不是「验证结论」，不存在 fail 形态；伪造点被压到「事实引用是否存在」
 *   这一个可审查的入口）。
 */
export type ReceiptIssuanceInput =
  | {
      readonly domain: "agent_method";
      /** 必须为 tool_package_version，且 subjectId 等于记录的 packageVersionId。 */
      readonly subject: VerificationSubject;
      readonly verifierId: string;
      readonly generatorId: string;
      readonly issuedAt: string;
      readonly validationRecord: ValidationRecord;
    }
  | {
      readonly domain: "user_explicit";
      /** 必须为 content_candidate。 */
      readonly subject: VerificationSubject;
      readonly verifierId: string;
      readonly generatorId: string;
      readonly issuedAt: string;
      /** 执行当时绑定的不可变事实引用；学习环不得自造，前缀受 allow-list 限制。 */
      readonly sourceFactRef: string;
    };

/** 调用方持有的不透明引用。除此之外调用方不持有任何授权事实。 */
export type ReceiptReference = {
  readonly receiptId: string;
};

/**
 * gateway 传给 reader 的期望绑定。reader 必须逐项核对，不允许「部分匹配即通过」。
 */
export type ReceiptExpectation = {
  readonly domain: VerificationDomain;
  readonly subjectKind: ReceiptSubjectKind;
  readonly subjectId: string;
  readonly subjectVersion: string;
  readonly scope: string;
};

/**
 * registry 读取/校验失败码。
 *
 * 与 Permission store 的消费失败码分属两套合同（外审 R2 §4.6 指出「签发期违规
 * 复用消费码」是语义混用；这里从第一天就分开）。
 *
 * 收窄记录：初版还声明了 `receipt_verdict_rejected` 与 `receipt_stale_subject`，
 * 但两者在 authority 侧永远不可能被产生 ——
 *   - 「只有 pass 能晋升」是**准入判断**，不是读取事实：`verify` 必须允许审计
 *     反复读出一张 fail 收据（WP-F §5），所以该门只能在 admission gateway 里；
 *   - 「改写即 stale」在读取侧已经由 `receipt_version_mismatch` 表达（版本不符
 *     即要求重新验证），再留一个同义码就是死码。
 * 因此它们被删除而不是留作「看起来更细」的失败面。键集合由
 * `failure-reason-hygiene.test.ts` 常驻扫描。
 */
export const RECEIPT_FAILURE_CODES = [
  "missing_receipt_ref",
  "invalid_receipt_ref",
  "unknown_receipt",
  "receipt_revoked",
  "receipt_domain_mismatch",
  "receipt_subject_mismatch",
  "receipt_version_mismatch",
  "receipt_scope_mismatch",
  "receipt_identity_not_independent",
  "registry_corrupt",
  "registry_torn_tail",
  "registry_lock_conflict",
  "registry_write_failed",
  "registry_multi_writer",
] as const;

export type ReceiptFailureCode = (typeof RECEIPT_FAILURE_CODES)[number];

/**
 * 签发/撤回期违规码。故意与读取失败码分离，避免「用消费码表示签发违规」
 * （外审 R2 §4.6 的同类问题）。
 *
 * 「重复撤回」刻意复用读取侧的 `receipt_revoked`：它在读取与撤回两条路径上
 * 语义相同（这条收据已不是 active），单独造一个同义码会立刻变成死码。
 */
export const RECEIPT_ISSUANCE_FAILURE_CODES = [
  "missing_issuance_field",
  "invalid_issuance_timestamp",
  "verdict_not_bound_to_checks",
  "generator_is_verifier",
] as const;

export type ReceiptIssuanceFailureCode = (typeof RECEIPT_ISSUANCE_FAILURE_CODES)[number];

export type ReceiptVerificationResult =
  | { readonly ok: true; readonly receipt: VerificationReceipt }
  | {
      readonly ok: false;
      readonly code: ReceiptFailureCode;
      readonly message: string;
    };

export type ReceiptIssuanceResult =
  | { readonly ok: true; readonly receipt: VerificationReceipt }
  | {
      readonly ok: false;
      readonly code: ReceiptIssuanceFailureCode | ReceiptFailureCode;
      readonly message: string;
    };

export type ReceiptRevocationResult =
  | { readonly ok: true; readonly receiptId: string; readonly status: "revoked" }
  | {
      readonly ok: false;
      readonly code: ReceiptIssuanceFailureCode | ReceiptFailureCode;
      readonly message: string;
    };

/**
 * reader 能力：**只有一个方法**（WP-F §7 D1.3）。
 * 不允许枚举全部记录、不允许按 subject 扫描，避免 reader 被当成第二数据源。
 */
export type VerificationAuthorityReader = {
  readonly verify: (
    reference: ReceiptReference,
    expected: ReceiptExpectation,
  ) => Promise<ReceiptVerificationResult>;
};

/**
 * writer 能力：只允许 verifier / checker composition 持有。
 *
 * 该类型从 `integration/**` 与 Board reducer 均不可达（由
 * `verification-authority.boundary.test.ts` 常驻扫描强制）。
 */
export type VerificationAuthorityWriter = {
  readonly issue: (input: ReceiptIssuanceInput) => Promise<ReceiptIssuanceResult>;
  readonly revoke: (
    receiptId: string,
    revokedAt: string,
    reason: string,
  ) => Promise<ReceiptRevocationResult>;
};

/** registry 同时提供读能力时使用；writer 与 reader 是分权导出，不合并成 facade。 */
export type VerificationAuthorityRegistry = VerificationAuthorityReader &
  VerificationAuthorityWriter;
