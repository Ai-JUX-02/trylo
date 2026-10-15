import type { RiskLevel } from "../../learning/control/contracts.js";

/**
 * admission envelope：adapter 无法从来源可靠推出的字段，必须由调用方显式提供。
 *
 * 规则（来自 WP-E 工作包）：commandId、issuedAt、evidenceId、scope、risk 等
 * 不能可靠推出的字段必须显式提供并被校验；禁止编造默认值填满 canonical 类型。
 * 因此本文件里的每个字段要么「来源侧不存在」，要么「来源侧存在但语义不同」。
 *
 * WP-F 的重大修改（外审 R2 §3.1/§3.2）：**证据准入不再接受任何可授予权力的
 * 自报字段**。`provenance`、`generatorId`、`verifierId`、`externalVerdict`、
 * `kinds`、`validationRecord`、`selfGenerated` 全部从 admission 中移除或不再被采信；
 * 调用方只能提交一个不透明引用 `receiptRef`，其余事实由 trusted admission gateway
 * 从 Verification Authority registry 读回并核对。
 */

/** 所有写 Board 的命令都需要、且 draft 侧一律没有的两个字段。 */
export type CommandAdmissionBase = {
  readonly commandId: string;
  readonly issuedAt: string;
};

/** C 内容域（user/prompt/skill/workflow）提交提案时必须显式给出的字段。 */
export type ContentProposalAdmission = CommandAdmissionBase & {
  readonly risk: RiskLevel;
  readonly hypothesis: string;
  readonly requiredVerifiers: readonly string[];
  readonly baseVersionId?: string;
  /**
   * 仅当来源 draft 根本没有 scope 时才需要（当前只有 workflow draft 如此）。
   * 若 draft 自带 scope，admission 再给一份就是第二状态源，一律拒绝。
   */
  readonly scope?: string;
};

/**
 * 撤回命令：draft 只有 targetHintHash，实体 id 与类型必须显式给出。
 *
 * 外审 P1-1：admission 必须绑定到它所撤回的那条 draft——`payloadId` 与
 * `assetKind` 是 draft 自带字段的回显，二者不一致即拒绝。
 * 外审 R2 §3.3 补充：回显校验对恶意调用方无约束力（同一攻击者构造 draft 与
 * admission 时恒可满足），因此真正的门在 Board 侧的目标存在性/合法性检查
 * （`apply-job.ts`）。
 */
export type WithdrawAdmission = CommandAdmissionBase & {
  readonly entityId: string;
  readonly entityType: "proposal" | "asset" | "observation" | "fragment";
  readonly reason: string;
  /** 必须等于 draft.command.payloadId。 */
  readonly payloadId: string;
  /** 必须等于 draft.command.assetKind。 */
  readonly assetKind: "user_rule" | "prompt_patch" | "skill" | "workflow";
  /**
   * 目标解析的来源说明（外审 R2 §3.3 的补充要求）：模糊自然语言撤回若没有
   * 权威 resolver 的证明，不得映射到任意 entityId。调用方必须声明它凭什么
   * 得出 `entityId`；`unresolved` 一律在映射层就不产生 tombstone。
   */
  readonly targetResolution: WithdrawTargetResolution;
};

export const WITHDRAW_TARGET_RESOLUTIONS = [
  "user_explicit_entity",
  "execution_bound_entity",
] as const;

export type WithdrawTargetResolution = (typeof WITHDRAW_TARGET_RESOLUTIONS)[number];

export type ContentAdmission = ContentProposalAdmission | WithdrawAdmission;

/**
 * C 评测证据 → canonical EvidenceBundle 时必须显式给出的字段。
 *
 * 自报字段已全部移除：`externalAnchors`/`externalPass`（draft 侧）与
 * `provenance`/`kinds`（admission 侧）都不再参与准入判断，只作为生成过程的
 * 诊断信息留在域 draft 里（WP-F §7 D3.1 的「废弃」口径）。
 * 用户证据的唯一来源是 `receiptRef` 指向的 `user_explicit` 域收据。
 */
export type ContentEvidenceAdmission = CommandAdmissionBase & {
  readonly evidenceId: string;
  readonly dataVersion: string;
  /** 不透明收据引用；gateway 从权威 registry 读回全部事实。 */
  readonly receiptRef: string;
  /** 被验证内容候选的版本坐标；必须与收据绑定一致。 */
  readonly candidateVersion: string;
  /** 证据作用的 scope；必须与收据绑定一致。 */
  readonly scope: string;
  readonly failureSamples?: readonly string[];
  readonly delta?: {
    readonly metric: string;
    readonly baseline: number;
    readonly candidate: number;
  };
};

/** D 缺口 → Board job。 */
export type ToolJobAdmission = CommandAdmissionBase & {
  readonly jobId: string;
  readonly observationId: string;
  readonly scope: string;
  readonly maxAttempts: number;
};

/** D 工具候选 / 绑定 → 提案。两者所需字段不同，分开建模避免用可选字段掩盖缺口。 */
export type ToolPackageAdmission = CommandAdmissionBase & {
  readonly scope: string;
  readonly hypothesis: string;
  readonly observationRefs: readonly string[];
  readonly requestedAuthorities: readonly string[];
};

/**
 * D 绑定 → 提案。
 *
 * 绑定不携带权限（Binding 不是 permission），因此这里没有 `requestedAuthorities`：
 * adapter 恒为空数组，调用方也不得提供。版本可追溯性由 `candidateRef`
 * （`tool_binding:<packageVersionId>`）承载；验证是否通过由 Board 的证据门裁决，
 * 不由 adapter 断言。
 */
export type ToolBindingAdmission = CommandAdmissionBase & {
  readonly risk: RiskLevel;
  readonly hypothesis: string;
  readonly observationRefs: readonly string[];
};

/**
 * D 证据 → canonical EvidenceBundle。
 *
 * 外审 R2 §3.1 的根本关闭点：调用方**不再提交 ValidationRecord**，也不再提交
 * `provenance`/`generatorId`/`verifierId`/`kinds`/`externalVerdict`。
 * 它只能提交 `receiptRef`——一个指向 Verification Authority registry 的不透明句柄。
 * 结构自洽的伪造记录因此失去全部权力：registry 里没有这条收据，就没有
 * external_verifier，也就永远派生不出 pass。
 */
export type ToolEvidenceAdmission = CommandAdmissionBase & {
  readonly proposalId: string;
  readonly dataVersion: string;
  /** 不透明收据引用；这是唯一能带来独立证据权力的字段。 */
  readonly receiptRef: string;
  /** 证据作用的 scope；必须与收据绑定一致。 */
  readonly scope: string;
  /** 证据所指的工具包版本；必须与收据绑定的 subject 一致。 */
  readonly packageVersionId: string;
  /** 弱信号（LLM 评审）引用；存在才产生 llm_critique 证据（不带任何 verdict）。 */
  readonly critiqueRef?: string;
  readonly failureSamples?: readonly string[];
};

export type ToolSuspendAdmission = CommandAdmissionBase & {
  readonly proposalId: string;
  readonly packageVersionId: string;
};

export type ToolRollbackAdmission = CommandAdmissionBase & {
  readonly proposalId: string;
  readonly packageVersionId: string;
  readonly requireBoardPreviousVersion: true;
};

export type ToolCommandAdmission =
  | ToolJobAdmission
  | ToolPackageAdmission
  | ToolBindingAdmission
  | ToolEvidenceAdmission
  | ToolSuspendAdmission
  | ToolRollbackAdmission;

/** D 观察 → canonical LearningObservation。 */
export type ToolObservationAdmission = {
  readonly scope: string;
  readonly outcome: "completed" | "failed" | "cancelled" | "unknown";
  readonly causalRefs: readonly string[];
  readonly privacyClass: "redacted" | "summary" | "tombstone";
  readonly verdict?: "pass" | "fail" | "partial";
};
