import { extractEvidence } from "../../learning/domains/user/evidence.js";
import { classifyUserSignal } from "../../learning/domains/user/evidence-grounding.js";
import {
  strongSignalOf,
  type JournalEvent,
  type StrongSignal,
} from "../../learning/domains/user/evidence-signal.js";
import { evaluateOutcome, type OutcomeEvent } from "../../learning/domains/user/outcome-evaluator.js";
import { prepareUserPolicy, type UserPolicySelection } from "../../learning/domains/user/prepare.js";
import type {
  BudgetAllowance,
  StrongSignalKind,
  UserLearningPorts,
  UserLearningRecord,
  WorkOrder,
} from "../../learning/domains/user/scheduler-ports.js";
import { fingerprintScopeV2 } from "../../learning/domains/user/scope-v2.js";
import { deriveUserPolicy, type DerivedUserPolicy } from "./chain.js";

/**
 * 用户学习的运行时：四个端口 + 一次 turn 的三件事。
 *
 * **四个端口是一道门，不是四个旋钮。** 采集口、预算口、工单口在每一轮各问一次，
 * 任何一个说不，这一轮就整轮不跑：不落证据、不读账、不注入、不产收据。三条理由：
 *
 *  - 验收合同 §7-#5 就是这么写的：注入 stub（采集关 / 预算尽 / 拒不点名）→ 子系统
 *    **不采集不注入不账**。三个口要是各管各的，「接口能接」这件事就只被证明了三分之一。
 *  - 总控制板将来要答的是「这次轮到谁、给多少」，那是一个**每轮的裁决**，不是一个
 *    每拍、每事件的开关。把裁决拆散到三条路径上，板就得同时出现在三个地方。
 *  - 账本口的两个动词之外没有第三个：删除不是本地文件写。所以「这一轮不跑」必须
 *    在**写之前**决定，事后收不回来。
 *
 * 一次 turn = 若干拍，所以三件事的生命周期**不一样**：
 *
 *  1. **capture** —— 每来一条 journal 事件就问一次 `strongSignalOf`；是强信号就落账
 *     （带原文的落成证据，不带的落成信号）。这是 UE-3，也是「绑执行环」的落点：
 *     坐标（`eventId`/`sessionId`/`turnId`）来自 envelope 本身，运行时**不自己造**（D6）。
 *  2. **policyFor** —— 这一拍要注入什么。额度按**当拍**的实际已花算（方法槽会给它
 *     一个长度），但总顶与工单是本轮那一次裁决的结果：预算为主顶，张数是结果（D4）。
 *  3. **finishTurn** —— 这一轮的效果事实：把本轮的强信号喂给 `outcome-evaluator`，
 *     观察落账。`task_completed` 在评估器里永远只是 `attribution: unknown`，所以
 *     「任务做完 = 偏好变强」在这条路上没有落脚点。
 *
 * 两条边界写在类型里而不是写在注释里：
 *
 *  - 运行时**不接受注入文本**。它没有 `inject(text)` 这样的方法，只有一个「问它要
 *    什么」的 `policyFor`；于是「谁往提示词里写了字」只有一个答案——组合层。
 *  - 运行时**不把正文交给可观察流**。`policyFor` 的返回值只走 `LoopPorts.method`
 *    的槽，而槽不进 transcript 也不进 journal（D7）；关于政策的那条账目记录只有
 *    `ruleIds` / `checksum` / 采用与否，没有一句话。
 */

export type UserLearningRuntimeDeps = {
  readonly ports: UserLearningPorts;
  readonly userId: string;
  readonly workspaceId: string;
  readonly now: () => number;
  /** 降级说给谁听。每次运行最多一行，且只说一次。 */
  readonly warn: (message: string) => void;
};

export type UserPolicyInjection = {
  readonly text: string;
  readonly chars: number;
};

export type UserLearningRuntime = {
  /** 一条 journal 事件进来了。只读它，不改它。 */
  readonly capture: (event: JournalEvent) => void;
  /**
   * 这一拍要注入什么，`undefined` 就是「这一段空着」。
   *
   * `spentChars` 是**本次请求里别人已经花掉的字符**（方法槽那一条的长度）。用户
   * 政策段与方法经验**共享一个总顶**，所以这里收的是「已花多少」而不是「还剩
   * 多少」：总顶只有一个主人（预算口），别人只报告自己花了多少。
   *
   * 按拍算，不是按轮算：方法槽每一拍都可能换一张卡（`reportBeat` 在拍末归档，
   * 拍与拍之间内容会变），所以「本轮第一次算的那个额度」在下一拍可能已经不对了。
   * 只有按当拍的实际已花去减总顶，D4 的「总超限」才在结构上不可能——记住一个
   * 早算好的额度，恰恰是它可能被超的原因。
   */
  readonly policyFor: (spentChars: number) => UserPolicyInjection | undefined;
  /** 这一轮结束了。效果事实在这里落账，本轮的暂存状态在这里清干净。 */
  readonly finishTurn: () => void;
};

/** 本轮的终态，只有三种值能进 `outcome-evaluator`；`unknown` 不是一种结论。 */
type TaskOutcome = "completed" | "failed" | "cancelled";

type TurnText = { readonly signal: "steer" | "correction"; readonly text: string };

export function createUserLearningRuntime(deps: UserLearningRuntimeDeps): UserLearningRuntime {
  let turnId: string | undefined;
  let taskText = "";
  let turnTexts: TurnText[] = [];
  let rollbackSeen = false;
  let taskOutcome: TaskOutcome | undefined;
  /** 本轮三个决定口的裁决；`undefined` 是「还没问」，与「问了说不行」不是一回事。 */
  let permitted: boolean | undefined;
  let allowance: BudgetAllowance | undefined;
  let workOrder: WorkOrder | undefined;
  let derived: DerivedUserPolicy | undefined;
  /** 本轮是否已经试过读账：读失败与「还没读」是两件事，不能共用一个 `undefined`。 */
  let derivedReady = false;
  /** 本轮已经落账的那个决策的指纹，避免同一决策每拍写一行。 */
  let recorded = "";
  let warned = false;

  function report(reason: string): void {
    if (warned) {
      return;
    }
    warned = true;
    deps.warn(`user_learning_degraded:${reason}`);
  }

  function append(records: readonly UserLearningRecord[]): void {
    if (records.length === 0) {
      return;
    }
    const result = deps.ports.ledger.append(records);
    if (!result.ok) {
      report(result.reason);
    }
  }

  /**
   * 这一轮跑不跑。三个口各问一次，第一次问的答案就是本轮的答案。
   *
   * 次序是采集 → 预算 → 工单，不是随手排的：采集口的那一问排在**读账之前**，于是
   * 「关掉采集还会不会偷偷留痕」在代码里没有答案可言——一次读都不该发生，而它在
   * 函数里的位置就是那条红线的样子。预算与工单的答案顺手记下来，`policyFor` 每拍
   * 用的是同一份——它们是「本轮给多少」，不是「这一拍给多少」。
   */
  function mayRun(): boolean {
    if (permitted !== undefined) {
      return permitted;
    }
    permitted = decideMayRun();
    return permitted;
  }

  function decideMayRun(): boolean {
    if (!deps.ports.collection.capture({ turnId: turnId ?? "" })) {
      return false;
    }
    const current = deps.ports.budget.allowance();
    if (!current.available) {
      return false;
    }
    const order = deps.ports.workOrder.grant({
      turnId: turnId ?? "",
      taskText,
      scopeFingerprint: fingerprintScopeV2({ userId: deps.userId, workspaceId: deps.workspaceId }),
    });
    if (order === undefined) {
      return false;
    }
    allowance = current;
    workOrder = order;
    return true;
  }

  function captureSignal(event: JournalEvent): void {
    const signal = strongSignalOf(event);
    if (signal === undefined) {
      return;
    }
    if (!mayRun()) {
      return;
    }
    if (signal.text !== undefined && (signal.signal === "steer" || signal.signal === "correction")) {
      turnTexts = [...turnTexts, { signal: signal.signal, text: signal.text }];
    }
    if (signal.signal === "rollback") {
      rollbackSeen = true;
    }
    const at = deps.now();
    append([...evidenceRecord(event, signal, at, deps.workspaceId), signalRecord(event, signal.signal, at)]);
  }

  function capture(event: JournalEvent): void {
    if (event.kind === "turn_start") {
      resetTurn();
      turnId = event.turnId;
      taskText = strongSignalOf(event)?.text ?? "";
      // 本轮的裁决只有一个时刻：开幕这一拍。此后 `captureSignal` / `policyFor` /
      // `finishTurn` 都只读这个结果，谁也不会在别的时刻再问一次板。
      permitted = decideMayRun();
    }
    if (event.kind === "terminal") {
      taskOutcome = outcomeOf(event.payload["reason"]);
    }
    captureSignal(event);
  }

  /** 本轮的暂存状态清零。三个决定口的裁决也在里面——换一轮就得重新问。 */
  function resetTurn(): void {
    turnId = undefined;
    taskText = "";
    turnTexts = [];
    rollbackSeen = false;
    taskOutcome = undefined;
    permitted = undefined;
    allowance = undefined;
    workOrder = undefined;
    derived = undefined;
    derivedReady = false;
    recorded = "";
  }

  /**
   * 本轮有效政策：读一次账、跑一次纯链、把新收据落账。**每轮只做一次。**
   *
   * 读账与推导与「这一拍还有多少额度」无关（额度只筛张数，不改结论），所以它们
   * 按轮缓存；变的只有 `prepareUserPolicy` 的 `budgetChars`。这样既不会每拍重读，
   * 也不会重复落收据。
   */
  function derivedFor(): DerivedUserPolicy | undefined {
    if (derivedReady) {
      return derived;
    }
    derivedReady = true;
    const read = deps.ports.ledger.read();
    if (!read.ok) {
      report(read.reason);
      return undefined;
    }
    if (read.unreadable > 0) {
      report(`ledger_unreadable:${read.unreadable}`);
    }
    derived = deriveUserPolicy({
      records: read.records,
      userId: deps.userId,
      workspaceId: deps.workspaceId,
      now: deps.now(),
    });
    append(derived.newReceipts.map((receipt) => ({ record: "receipt" as const, receipt })));
    return derived;
  }

  /**
   * 额度 = min(总顶 − 已花, 工单给的)。两个上界都保留：总顶是「这次请求还能装多少」，
   * 工单是「控制板这次准你花多少」——控制板以后要分开管这两件事，所以这里不把它们
   * 合成一个数。
   */
  function policyFor(spentChars: number): UserPolicyInjection | undefined {
    if (!mayRun()) {
      return undefined;
    }
    const top = allowance?.totalChars ?? 0;
    const budgetChars = Math.min(top - spentChars, workOrder?.chars ?? 0);
    if (budgetChars <= 0) {
      return undefined;
    }
    const policy = derivedFor();
    if (policy === undefined) {
      return undefined;
    }
    return selectPolicy(policy, budgetChars);
  }

  function selectPolicy(
    policy: DerivedUserPolicy,
    budgetChars: number,
  ): UserPolicyInjection | undefined {
    const selection = prepareUserPolicy({
      rules: policy.rules,
      models: policy.models,
      scopeFingerprint: policy.scopeFingerprint,
      taskText,
      budgetChars,
    });
    recordDecision(policy, selection);
    return selection.segment === undefined
      ? undefined
      : { text: selection.segment, chars: selection.chars };
  }

  /**
   * 决策落账，**同一决策一轮只写一行**。
   *
   * 为什么要比对而不是无条件写：额度按拍算，一轮里后面的拍可能因为方法槽变长只
   * 放得下更少条规则。那是同一轮里**两个不同的决定**，都该留痕；但重复的同一个
   * 决定留两行只会让账本变胖。记录的仍然只有身份（规则 id、条数、字符数、校验和），
   * 一句话都没有（D7）。
   */
  function recordDecision(policy: DerivedUserPolicy, selection: UserPolicySelection): void {
    const signature = `${selection.adoptedRuleIds.join(",")}|${selection.chars}`;
    if (signature === recorded) {
      return;
    }
    recorded = signature;
    append([
      {
        record: "policy",
        adopted: selection.segment !== undefined,
        ruleIds: selection.adoptedRuleIds,
        matched: selection.adoptedRuleIds.length + selection.droppedRuleIds.length,
        chars: selection.chars,
        scopeFingerprint: policy.scopeFingerprint,
        bundleChecksum: policy.bundleChecksum,
        ...(turnId === undefined ? {} : { turnId }),
        at: deps.now(),
      },
    ]);
  }

  function outcomeEvents(): OutcomeEvent[] {
    const events: OutcomeEvent[] = turnTexts.map((item) =>
      item.signal === "correction"
        ? { kind: "correction", text: item.text }
        : { kind: "feedback_text", text: item.text },
    );
    return rollbackSeen ? [...events, { kind: "rollback" }] : events;
  }

  function finishTurn(): void {
    const commitments = derived?.commitments ?? [];
    if (commitments.length > 0 && mayRun()) {
      const result = evaluateOutcome({
        commitmentIds: commitments.map((item) => item.id),
        events: outcomeEvents(),
        ...(taskOutcome === undefined ? {} : { taskOutcome }),
        ...(turnId === undefined ? {} : { traceId: turnId }),
        now: deps.now(),
      });
      append(
        result.observations.map((observation) => ({ record: "observation" as const, observation })),
      );
    }
    resetTurn();
  }

  return { capture, policyFor, finishTurn };
}

/**
 * 带文本的信号 → 一条证据记录；不带文本就是空数组。
 *
 * 四件事按 UL 包自己的取证口径来，一处都不另发明：
 *
 *  - **`eventKind` 由信号给，不从文本再猜一遍。** journal 说的是「这一拍发生了
 *    一次纠正」，那这条证据就是 `correction`；`extractEvidence` 自己那套文本嗅探
 *    是给「只有文本、没有事件」的调用方用的（`builder.ts::extractFastEvidence`
 *    也是显式传的）。
 *  - **`durability` / `signalKind` 走 `classifyUserSignal`。** 这两格决定「这条偏好
 *    能活多久」，默认值是 `session_local` / `task_requirement` —— 不传，一条明说
 *    「以后都这样」的偏好就会被当成一次性要求，深链从此再也长不出结论。这条接线
 *    的第一版就是这么错的，由 `runtime.test.ts` 的整机用例钉住。
 *  - **没有 `sessionId` 时不落证据（D6）：** 证据必须绑运行身份，造一个空身份等于
 *    给证据安一个假坐标。信号本身仍然落账——它说的是「发生过什么」，不依赖谁在说。
 *  - **`informedness` 由事件位置给。** 开幕那一拍是 `pre_task`，中途插话是 `in_task`。
 *  - **`workspaceId` 在写入这一刻盖戳（E0M1 P1-1）。** 账本是单一物理文件、不按
 *    workspace 分键，所以「这条证据属于哪个工作区」必须在**产生时**写进来源，而不是
 *    读出来时用当前运行时的 workspace 重新盖——后者会让 A 工作区的偏好被建模成 B 的。
 */
function evidenceRecord(
  event: JournalEvent,
  signal: StrongSignal,
  at: number,
  workspaceId: string,
): readonly UserLearningRecord[] {
  const text = signal.text;
  if (text === undefined || event.sessionId === undefined) {
    return [];
  }
  const eventKind = signal.signal === "correction" ? "correction" : "explicit_statement";
  const grounding = classifyUserSignal(text, eventKind);
  const evidence = extractEvidence({
    text,
    eventKind,
    source: {
      sessionId: event.sessionId,
      ...(event.turnId === undefined ? {} : { turnId: event.turnId }),
      workspaceId,
    },
    informedness: event.kind === "turn_start" ? "pre_task" : "in_task",
    durability: grounding.durability,
    signalKind: grounding.signalKind,
    now: at,
  });
  return evidence === null ? [] : [{ record: "evidence", evidence }];
}

function signalRecord(event: JournalEvent, signal: StrongSignalKind, at: number): UserLearningRecord {
  return {
    record: "signal",
    signal,
    eventId: event.eventId,
    ...(event.sessionId === undefined ? {} : { sessionId: event.sessionId }),
    ...(event.turnId === undefined ? {} : { turnId: event.turnId }),
    at,
  };
}

function outcomeOf(reason: unknown): TaskOutcome | undefined {
  return reason === "completed" || reason === "failed" || reason === "cancelled" ? reason : undefined;
}
