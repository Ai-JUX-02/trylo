import { sha256Hex } from "../shared/hash.js";

/**
 * Canonical scope v2：身份（这条学习属于谁、在哪）与条件
 * （什么情况下适用）分离。product 维度按 CLI 现实处理：
 * 当前单表面，字段保留但值默认 unknown，不伪造。
 */
export type ScopeProduct = "code" | "work" | "unknown";

export type ScopeIdentity = {
  readonly userId: string;
  readonly workspaceId?: string;
  readonly projectId?: string;
  readonly component?: string;
  readonly taskFamilyId?: string;
};

export type ScopeConditions = {
  readonly taskStage?: "explore" | "plan" | "produce" | "review" | "deliver";
  readonly riskLevel?: "low" | "medium" | "high";
  readonly reversible?: boolean;
  readonly corePath?: boolean;
};

export type ScopeV2 = {
  readonly identity: ScopeIdentity;
  readonly conditions: ScopeConditions;
  readonly product: ScopeProduct;
  readonly fingerprint: string;
};

export type ScopeV2Input = {
  readonly userId?: string;
  readonly workspaceId?: string;
  readonly projectId?: string;
  readonly taskFamilyId?: string;
  readonly taskId?: string;
  readonly product?: "code" | "work";
  readonly conditions?: ScopeConditions;
};

type CanonicalScopeV2 = {
  readonly product: ScopeProduct;
  readonly workspaceId: string | null;
  readonly projectId: string | null;
  readonly component: string | null;
  readonly taskFamilyId: string | null;
  readonly taskStage: ScopeConditions["taskStage"] | null;
  readonly riskLevel: ScopeConditions["riskLevel"] | null;
  readonly reversible: boolean | null;
  readonly corePath: boolean | null;
};

function canonicalize(input: ScopeV2Input): CanonicalScopeV2 {
  const conditions = input.conditions ?? {};
  return {
    product: input.product ?? "unknown",
    workspaceId: input.workspaceId ?? null,
    projectId: input.projectId ?? null,
    component: null,
    taskFamilyId: input.taskFamilyId ?? input.taskId ?? null,
    taskStage: conditions.taskStage ?? null,
    riskLevel: conditions.riskLevel ?? null,
    reversible: conditions.reversible ?? null,
    corePath: conditions.corePath ?? null,
  };
}

/** JSON 属性顺序是 ScopeKey v2 指纹的一部分，冻结不得调序。 */
export function serializeScopeV2(input: ScopeV2Input): string {
  return JSON.stringify(canonicalize(input));
}

export function fingerprintScopeV2(input: ScopeV2Input): string {
  return `v2:${sha256Hex(serializeScopeV2(input))}`;
}

export function decideScopeV2(input: ScopeV2Input): ScopeV2 {
  const conditions = input.conditions ?? {};
  return {
    identity: {
      userId: input.userId ?? "local-user",
      ...(input.workspaceId === undefined ? {} : { workspaceId: input.workspaceId }),
      ...(input.projectId === undefined ? {} : { projectId: input.projectId }),
      ...((input.taskFamilyId ?? input.taskId) === undefined
        ? {}
        : { taskFamilyId: (input.taskFamilyId ?? input.taskId) as string }),
    },
    conditions,
    product: input.product ?? "unknown",
    fingerprint: fingerprintScopeV2(input),
  };
}

/** 同一指纹 = 同一稳定作用域；跨版本比较只认指纹，不认对象形状。 */
export function sameStableScopeV2(a: Pick<ScopeV2, "fingerprint">, b: Pick<ScopeV2, "fingerprint">): boolean {
  return a.fingerprint === b.fingerprint;
}
