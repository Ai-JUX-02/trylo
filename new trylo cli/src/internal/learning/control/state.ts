import type {
  ActivationRecord,
  ApprovalRequest,
  AssetKind,
  EvidenceBundle,
  LearningAssetVersion,
  LearningJob,
  LearningProposal,
  MethodFeedback,
  MethodFielding,
  MethodRetention,
  Tombstone,
} from "./contracts.js";
import { activationKey, isMethodFeedback, isMethodFielding, isMethodRetention } from "./contracts.js";

export type AppliedCommand = {
  readonly commandId: string;
  readonly sequence: number;
  readonly payloadHash?: string;
};

export type BoardState = {
  readonly sequence: number;
  readonly appliedCommands: ReadonlyArray<AppliedCommand>;
  readonly proposals: ReadonlyArray<LearningProposal>;
  readonly assets: ReadonlyArray<LearningAssetVersion>;
  readonly activations: ReadonlyArray<ActivationRecord>;
  readonly evidence: ReadonlyArray<EvidenceBundle>;
  readonly approvals: ReadonlyArray<ApprovalRequest>;
  readonly jobs: ReadonlyArray<LearningJob>;
  readonly tombstones: ReadonlyArray<Tombstone>;
  /** 方法上场记录（M1）：旧快照缺省即空，由 `normalizeBoardState` 补齐。 */
  readonly fieldings: ReadonlyArray<MethodFielding>;
  /** 方法帮助反馈（M1）：旧快照缺省即空，由 `normalizeBoardState` 补齐。 */
  readonly feedbacks: ReadonlyArray<MethodFeedback>;
  /** Absent in pre-lifecycle snapshots; old cards start in working. */
  readonly methodRetentions?: ReadonlyArray<MethodRetention>;
};

export function emptyBoardState(): BoardState {
  return {
    sequence: 0,
    appliedCommands: [],
    proposals: [],
    assets: [],
    activations: [],
    evidence: [],
    approvals: [],
    jobs: [],
    tombstones: [],
    fieldings: [],
    feedbacks: [],
  };
}

/**
 * 旧快照兼容 + 元素级解码守卫（E0M1 P2-4）。
 *
 * 两件事，对应两种「读不出来」：
 *
 *  1. **缺字段**（M1 之前持久的 `BoardState` 没有 `fieldings`/`feedbacks`）：缺省即
 *     空账（该版本确实没有上场/反馈事实），不伪造历史、不静默清空新账。
 *  2. **字段在但元素非法**：绝不 blind cast。任一元素过不了 `isMethodFielding` /
 *     `isMethodFeedback` 守卫，整张快照按**损坏**处理——返回 `undefined`，调用方据
 *     此回退到日志重放（日志才是权威，重放从真实命令重建这两本账，自愈）。半信半疑
 *     地把一条畸形记录断言成合法，比丢掉整张快照危险得多。
 */
export function normalizeBoardState(state: BoardState): BoardState | undefined {
  const fieldings = decodeArray((state as { fieldings?: unknown }).fieldings, isMethodFielding);
  const feedbacks = decodeArray((state as { feedbacks?: unknown }).feedbacks, isMethodFeedback);
  const methodRetentions = decodeArray(state.methodRetentions, isMethodRetention);
  if (fieldings === undefined || feedbacks === undefined || methodRetentions === undefined) {
    return undefined;
  }
  return { ...state, fieldings, feedbacks, methodRetentions };
}

/**
 * 缺省 → 空账；数组 → 逐元素守卫，任一非法即 `undefined`（整张快照损坏）。
 * 非数组的在场值（如对象、字符串）同样非法，与「元素非法」一个口径。
 */
function decodeArray<T>(value: unknown, guard: (item: unknown) => item is T): ReadonlyArray<T> | undefined {
  if (value === undefined || value === null) {
    return [];
  }
  if (!Array.isArray(value)) {
    return undefined;
  }
  const decoded: T[] = [];
  for (const item of value) {
    if (!guard(item)) {
      return undefined;
    }
    decoded.push(item);
  }
  return decoded;
}

export function findProposal(
  state: BoardState,
  proposalId: string,
): LearningProposal | undefined {
  return state.proposals.find((item) => item.proposalId === proposalId);
}

export function findAsset(
  state: BoardState,
  versionId: string,
): LearningAssetVersion | undefined {
  return state.assets.find((item) => item.versionId === versionId);
}

export function findActivation(
  state: BoardState,
  scope: string,
  assetKind: AssetKind,
): ActivationRecord | undefined {
  const key = activationKey(scope, assetKind);
  return state.activations.find(
    (item) => activationKey(item.scope, item.assetKind) === key,
  );
}

export function findActivationByProposal(
  state: BoardState,
  proposal: LearningProposal,
): ActivationRecord | undefined {
  return findActivation(state, proposal.scope, proposal.assetKind);
}

export function findEvidenceFor(
  state: BoardState,
  proposalId: string,
): ReadonlyArray<EvidenceBundle> {
  return state.evidence.filter((item) => item.proposalId === proposalId);
}

export function findApproval(
  state: BoardState,
  approvalId: string,
): ApprovalRequest | undefined {
  return state.approvals.find((item) => item.approvalId === approvalId);
}

export function findApprovalForProposal(
  state: BoardState,
  proposalId: string,
): ApprovalRequest | undefined {
  return state.approvals.find((item) => item.proposalId === proposalId);
}

export function findJob(state: BoardState, jobId: string): LearningJob | undefined {
  return state.jobs.find((item) => item.jobId === jobId);
}

export function findJobByDedupe(
  state: BoardState,
  dedupeKey: string,
): LearningJob | undefined {
  return state.jobs.find((item) => item.dedupeKey === dedupeKey);
}

export function findTombstone(
  state: BoardState,
  entityId: string,
): Tombstone | undefined {
  return state.tombstones.find((item) => item.entityId === entityId);
}

export function wasApplied(state: BoardState, commandId: string): boolean {
  return state.appliedCommands.some((item) => item.commandId === commandId);
}

export function replaceById<T>(
  items: ReadonlyArray<T>,
  match: (item: T) => boolean,
  next: T,
): T[] {
  const index = items.findIndex(match);
  if (index < 0) {
    return [...items, next];
  }
  const copy = items.slice();
  copy[index] = next;
  return copy;
}
