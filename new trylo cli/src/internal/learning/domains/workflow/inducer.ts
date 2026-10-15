import {
  submitDraftCommand,
  submitWithdrawCommand,
  type BoardCommandDraft,
} from "../shared/board-command.js";
import { ruleIdentity } from "../shared/dual-save.js";
import { scanForbiddenBody } from "../shared/forbidden-scan.js";
import { shortId } from "../shared/hash.js";
import {
  domainFailure,
  DRAFT_STATUS,
  type DomainFailure,
  type DraftStatus,
  type Provenance,
  type TaskFamily,
  type TrajectorySketch,
} from "../shared/types.js";

export const DEFAULT_WORKFLOW_MIN_REPEATS = 2;

export type WorkflowEpisode = {
  readonly id: string;
  readonly taskFamily: TaskFamily;
  readonly trajectory: TrajectorySketch;
  readonly nodeInputs: Readonly<Record<string, string>>;
  readonly nodeOutputs: Readonly<Record<string, string>>;
  readonly fallback: string;
  readonly outcome: "success" | "failure";
};

export type WorkflowNode = {
  readonly id: string;
  readonly input: string;
  readonly output: string;
};

export type WorkflowTransition = {
  readonly from: string;
  readonly to: string;
};

export type WorkflowBudget = {
  readonly maxSteps: number;
  readonly maxTokens: number;
  readonly maxWallMs: number;
};

export type WorkflowCheckpoint = {
  readonly afterNode: string;
  readonly check: string;
};

export type WorkflowFallback = {
  readonly on: string;
  readonly goto: string;
};

export type WorkflowDraft = {
  readonly kind: "workflow";
  readonly status: DraftStatus;
  readonly id: string;
  readonly name: string;
  readonly version: number;
  readonly nodes: readonly WorkflowNode[];
  readonly transitions: readonly WorkflowTransition[];
  readonly budget: WorkflowBudget;
  readonly verificationCheckpoints: readonly WorkflowCheckpoint[];
  readonly failureFallback: readonly WorkflowFallback[];
  readonly mutableFields: readonly string[];
  readonly provenance: Provenance;
  readonly source: string;
  readonly identity: string;
  readonly positiveRules: readonly string[];
  readonly negativeRules: readonly string[];
  readonly permissionClaim: false;
  readonly teamTopologyChanged: false;
  readonly command: BoardCommandDraft;
};

export type WorkflowInduceResult =
  | { readonly kind: "draft"; readonly draft: WorkflowDraft }
  | DomainFailure;

export function induceWorkflow(
  episodes: readonly WorkflowEpisode[],
  existingVersions: readonly number[] = [],
): WorkflowInduceResult {
  const smuggled = scanForbiddenBody(
    episodes.flatMap((episode) => [
      ...episode.trajectory.nodeIds,
      episode.fallback,
      ...Object.values(episode.nodeInputs),
      ...Object.values(episode.nodeOutputs),
    ]),
  );
  if (smuggled.length > 0) {
    return domainFailure(
      "forbidden_payload",
      "workflow cannot carry permission, download, or tool switch",
      smuggled,
    );
  }
  if (episodes.length < DEFAULT_WORKFLOW_MIN_REPEATS) {
    return domainFailure(
      "needs_more_evidence",
      "workflow induction needs repeated node/transition evidence",
    );
  }
  const family = episodes[0]?.taskFamily;
  const firstNodes = episodes[0]?.trajectory.nodeIds;
  if (family === undefined || firstNodes === undefined || firstNodes.length < 2) {
    return domainFailure("needs_more_evidence", "trajectories lack stable nodes");
  }
  const repeats = episodes.filter((episode) =>
    sameNodes(episode.trajectory.nodeIds, firstNodes),
  );
  if (repeats.length < DEFAULT_WORKFLOW_MIN_REPEATS) {
    return domainFailure(
      "needs_more_evidence",
      "node sequences are not stable across episodes",
    );
  }
  if (repeats.every((episode) => episode.trajectory.hadFailureRecovery === false)) {
    return domainFailure(
      "needs_more_evidence",
      "workflow drafts must include failure/fallback experience",
    );
  }
  const failed = repeats.find((episode) => episode.outcome === "failure");
  if (failed === undefined) {
    return domainFailure(
      "needs_more_evidence",
      "positive and negative trajectories are both required",
    );
  }
  const nodes: WorkflowNode[] = firstNodes.map((nodeId) => ({
    id: nodeId,
    input: repeats[0]?.nodeInputs[nodeId] ?? `${nodeId}.in`,
    output: repeats[0]?.nodeOutputs[nodeId] ?? `${nodeId}.out`,
  }));
  const transitions: WorkflowTransition[] = [];
  for (let index = 0; index < firstNodes.length - 1; index += 1) {
    const from = firstNodes[index];
    const to = firstNodes[index + 1];
    if (from !== undefined && to !== undefined) {
      transitions.push({ from, to });
    }
  }
  const lastNode = firstNodes[firstNodes.length - 1] ?? "end";
  const version = Math.max(0, ...existingVersions) + 1;
  const identity = ruleIdentity(firstNodes);
  const id = shortId("wf", [family.id, String(version), identity]);
  const draft: WorkflowDraft = {
    kind: "workflow",
    status: DRAFT_STATUS,
    id,
    name: `${family.intentClass}-flow`,
    version,
    nodes,
    transitions,
    budget: {
      maxSteps: firstNodes.length + 2,
      maxTokens: 8000,
      maxWallMs: 120000,
    },
    verificationCheckpoints: [
      { afterNode: lastNode, check: `${family.checkKind} must pass` },
    ],
    failureFallback: [{ on: "node_failure", goto: failed.fallback }],
    mutableFields: ["budget.maxSteps", "budget.maxTokens", "failureFallback"],
    provenance: {
      source: "inferred_from_observations",
      observationRefs: repeats.map((episode) => episode.id),
      createdBy: "workflow_inducer",
    },
    source: "trajectory-induction",
    identity,
    positiveRules: transitions.map((item) => `take ${item.from} -> ${item.to}`),
    negativeRules: [`on failure goto ${failed.fallback}`],
    permissionClaim: false,
    teamTopologyChanged: false,
    command: submitDraftCommand("workflow", id),
  };
  return { kind: "draft", draft };
}

function sameNodes(left: readonly string[], right: readonly string[]): boolean {
  return left.join(">") === right.join(">");
}

export function renderWorkflowMarkdown(draft: WorkflowDraft): string {
  return [
    `# ${draft.name} v${draft.version}`,
    "## Nodes",
    ...draft.nodes.map((node) => `- ${node.id}: ${node.input} -> ${node.output}`),
    "## Transitions",
    ...draft.transitions.map((item) => `- ${item.from} -> ${item.to}`),
    `Budget: steps=${draft.budget.maxSteps} tokens=${draft.budget.maxTokens}`,
    "## Fallback",
    ...draft.failureFallback.map((item) => `- ${item.on} -> ${item.goto}`),
    "## Positive rules",
    ...draft.positiveRules.map((rule) => `- ${rule}`),
    "## Negative rules",
    ...draft.negativeRules.map((rule) => `- ${rule}`),
  ].join("\n");
}

export function withdrawWorkflow(id: string): BoardCommandDraft {
  return submitWithdrawCommand("workflow", id);
}

export function editWorkflow(
  draft: WorkflowDraft,
  patch: { readonly budget?: WorkflowBudget },
): WorkflowDraft {
  const version = draft.version + 1;
  const id = shortId("wf", [draft.name, String(version), draft.identity]);
  return {
    ...draft,
    id,
    version,
    budget: patch.budget ?? draft.budget,
    command: submitDraftCommand("workflow", id),
  };
}
