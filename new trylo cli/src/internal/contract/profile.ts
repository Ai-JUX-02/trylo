export type ToolBindingRef = {
  readonly versionId: string;
  readonly toolId: string;
  readonly scope: string;
};

export type ProfileRule = {
  readonly versionId: string;
  readonly scope: string;
  readonly text: string;
};

export type ProfileRef = {
  readonly versionId: string;
  readonly scope: string;
};

export type ProfileDiagnostic = {
  readonly code: string;
  readonly message: string;
};

export type ExecutionProfileMode = "full" | "last_known_good" | "no_learning";

export type ExecutionProfileSnapshot = {
  readonly snapshotId: string;
  readonly scope: string;
  readonly userRules: ReadonlyArray<ProfileRule>;
  readonly promptPatches: ReadonlyArray<ProfileRule>;
  readonly skillRefs: ReadonlyArray<ProfileRef>;
  readonly workflowRef?: ProfileRef;
  readonly toolBindings: readonly ToolBindingRef[];
  readonly requiredCheckRefs: readonly string[];
  readonly assetVersions: Readonly<Record<string, string>>;
  readonly createdFromBoardSequence: number;
  readonly snapshotHash: string;
  readonly learningMode: ExecutionProfileMode;
  readonly diagnostics: ReadonlyArray<ProfileDiagnostic>;
};

export const EMPTY_PROFILE: ExecutionProfileSnapshot = {
  snapshotId: "snap-empty",
  scope: "none",
  userRules: [],
  promptPatches: [],
  skillRefs: [],
  toolBindings: [],
  requiredCheckRefs: [],
  assetVersions: {},
  createdFromBoardSequence: 0,
  snapshotHash: "empty",
  learningMode: "no_learning",
  diagnostics: [],
};

export type ProfilePort = {
  load(taskId: string): Promise<ExecutionProfileSnapshot>;
};
