import { shortId } from "../shared/hash.js";
import {
  routeForClass,
  type EligibilityClass,
  type EligibilityDecision,
  type UserEvidence,
} from "./contracts.js";
import type { UserSpeechAct } from "./speech-act.js";

const AUTH_MARK = /权限|授权|凭证|密码|密钥|登录|账号|支付|permission|credential|secret|token|跳过审批|skip approval|bypass approval|允许网络|allow network|不要审批/;
const SESSION_MARK = /这次|当前任务|这个任务|临时|仅本次|先把这|现在先/;
const PERSIST_MARK = /以后|今后|每次|一直|默认|项目里|这个项目|长期|通常|习惯|所有项目/;
const REPORT_OBJECT = /报告|周报|汇报|总结|交付说明/;
const REPORT_BEHAVIOR = /结论优先|先说结论|只要结论|背景优先|先说背景|依据展开|详细依据|少说过程|不要过程/;
const ARTIFACT_OBJECT = /方案|文稿|文档|幻灯片|提案|草稿/;
const ARTIFACT_BEHAVIOR = /先(?:看|给|出)?结构|结构优先|先(?:出|给|写)?完整|先出一版|先草稿/;
const CLEAR_OBJECT = /审核|计划|实现|报告|周报|汇报|方案|文稿|文档|工具|界面|代码|任务|交付|检查/;
const CLEAR_BEHAVIOR = /不要|避免|减少|优先|先|直接|保留|展开|简短|详细|克制|这样做/;
const QUALITY_DEFECT_MARK = /编造|引用|造假|不对|错了|有问题|乱写|丢数据|不准确|胡说|瞎编/;
const CONFIRM_BEHAVIOR = /keep doing|继续这样|保持这样|以后这样/;

export type EligibilityInput = {
  readonly evidence: UserEvidence;
  readonly speechAct: UserSpeechAct;
  readonly residualText?: string;
  readonly now?: number;
};

function rawTextOf(evidence: UserEvidence): string {
  return `${evidence.rawText} ${evidence.claim ?? ""}`.trim();
}

/**
 * "先修自己"资格闸：闭集五类判别联合，不是布尔组合。
 *
 * 顺序即优先级，每条输入恰落一类：
 * 1 会话限定（SESSION 且无 PERSIST）→ session_instruction；
 * 2 明确未来指令（future_directive + PERSIST）→ personalization_candidate；
 * 3 授权语言：残留偏好为空 → authorization_or_permission，
 *   残留偏好非空 → candidate（权限部分由上游剥离并标记，本闸只判偏好部分）；
 * 4 有支撑的偏好对（报告/产物对象 × 行为）或接地的协作偏好 → candidate；
 * 5 纠正带持续范围且对象行为明确 → candidate，否则质量缺陷；
 * 6 质量缺陷信号 → general_quality_defect；
 * 7 兜底 → insufficient_information（不猜）。
 */
export function classifyEligibility(input: EligibilityInput): EligibilityDecision {
  const text = rawTextOf(input.evidence);
  const now = input.now ?? Date.now();
  const decide = (
    classification: EligibilityClass,
    rationale: string,
    alternativeExplanations: readonly string[] = [],
  ): EligibilityDecision => ({
    id: shortId("elig", [input.evidence.id, classification]),
    sourceEvidenceIds: [input.evidence.id],
    classification,
    route: routeForClass(classification),
    rationale,
    alternativeExplanations,
    createdAt: now,
  });

  if (SESSION_MARK.test(text) && !PERSIST_MARK.test(text)) {
    return decide("session_instruction", "该信号明确限制在当前任务或本次协作中。");
  }

  if (AUTH_MARK.test(text) && (input.residualText ?? "").trim().length === 0) {
    return decide("authorization_or_permission", "该信号涉及权限、凭证或授权，必须由权限规则处理。");
  }

  if (input.speechAct === "future_directive" && PERSIST_MARK.test(text)) {
    return decide(
      "personalization_candidate",
      "用户用明确的未来指令表达了可长期复用的协作偏好。",
      ["可能只适用于当前项目", "可能由本次交付受众或阶段造成"],
    );
  }

  if (AUTH_MARK.test(text)) {
    return decide(
      "personalization_candidate",
      "授权话术之外仍有明确的残留偏好；授权部分不进入画像，由上游剥离标记。",
      ["可能只适用于当前项目"],
    );
  }

  const supportedPreference =
    (REPORT_OBJECT.test(text) && REPORT_BEHAVIOR.test(text)) ||
    (ARTIFACT_OBJECT.test(text) && ARTIFACT_BEHAVIOR.test(text));
  if (supportedPreference) {
    return decide(
      "personalization_candidate",
      "该信号在多个合格做法之间表达了明确的交付行为偏好。",
      ["可能只适用于当前项目", "可能由本次交付受众或阶段造成"],
    );
  }

  const groundedCollaboration =
    (input.evidence.signalKind === "collaboration_preference" ||
      input.evidence.signalKind === "cognition_answer") &&
    CLEAR_OBJECT.test(text) &&
    CLEAR_BEHAVIOR.test(text);
  if (groundedCollaboration) {
    return decide(
      "personalization_candidate",
      "用户来源信号同时包含明确对象和可执行行为。",
      ["可能只适用于当前项目"],
    );
  }

  if (input.evidence.eventKind === "correction" || input.evidence.signalKind === "correction") {
    if (PERSIST_MARK.test(text) && CLEAR_OBJECT.test(text) && CLEAR_BEHAVIOR.test(text)) {
      return decide(
        "personalization_candidate",
        "纠正包含持续范围，且存在多个同样合格的协作做法。",
        ["可能只适用于当前项目"],
      );
    }
    return decide("general_quality_defect", "该纠正更可能是结果质量问题，不能默认解释为个人偏好。");
  }

  if (QUALITY_DEFECT_MARK.test(text)) {
    return decide("general_quality_defect", "该信号指向结果的真实性或正确性，当场修，不画像。");
  }

  if (input.speechAct === "confirm" && CONFIRM_BEHAVIOR.test(text)) {
    return decide(
      "personalization_candidate",
      "用户明确确认了当前做法可长期保持。",
      ["可能只是对本次结果满意"],
    );
  }

  return decide("insufficient_information", "没有足够信息证明这是可长期复用的协作偏好。");
}
