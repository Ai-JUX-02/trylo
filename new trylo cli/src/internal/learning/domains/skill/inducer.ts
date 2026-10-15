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
  type Scope,
  type TaskFamily,
  type TrajectorySketch,
} from "../shared/types.js";

export const DEFAULT_SKILL_MIN_EPISODES = 3;

export type SkillEpisode = {
  readonly id: string;
  readonly taskFamily: TaskFamily;
  readonly trajectory: TrajectorySketch;
  readonly outcome: "success" | "failure";
  readonly steps: readonly string[];
  readonly checks: readonly string[];
  readonly failureMode?: string;
};

export type SkillExampleRef = {
  readonly episodeId: string;
  readonly outcome: "success" | "failure";
};

export type SkillDraft = {
  readonly kind: "skill";
  readonly status: DraftStatus;
  readonly id: string;
  readonly name: string;
  readonly version: number;
  readonly trigger: string;
  readonly steps: readonly string[];
  readonly checks: readonly string[];
  readonly failureModes: readonly string[];
  readonly positiveExamples: readonly SkillExampleRef[];
  readonly negativeExamples: readonly SkillExampleRef[];
  readonly positiveRules: readonly string[];
  readonly negativeRules: readonly string[];
  readonly provenance: Provenance;
  readonly scope: Scope;
  readonly identity: string;
  readonly permissionClaim: false;
  readonly command: BoardCommandDraft;
};

export type SkillInduceResult =
  | { readonly kind: "draft"; readonly draft: SkillDraft }
  | DomainFailure;

export function induceSkill(
  episodes: readonly SkillEpisode[],
  existingVersions: readonly number[] = [],
): SkillInduceResult {
  const smuggled = scanForbiddenBody(
    episodes.flatMap((episode) => [...episode.steps, ...episode.checks, episode.failureMode ?? ""]),
  );
  if (smuggled.length > 0) {
    return domainFailure(
      "forbidden_payload",
      "skill cannot carry permission, download, or tool switch",
      smuggled,
    );
  }
  if (episodes.length === 1 && isPhrasingOnly(episodes[0])) {
    return domainFailure(
      "needs_more_evidence",
      "a single phrasing change is not a skill",
    );
  }
  if (episodes.length < DEFAULT_SKILL_MIN_EPISODES) {
    return domainFailure(
      "needs_more_evidence",
      "skill induction needs at least three similar multi-step episodes",
    );
  }
  const family = episodes[0]?.taskFamily;
  if (family === undefined) {
    return domainFailure("needs_more_evidence", "missing task family");
  }
  for (const episode of episodes) {
    if (episode.taskFamily.intentClass !== family.intentClass) {
      return domainFailure(
        "insufficient_attribution",
        "skill episodes span incomparable task families",
        ["intentClass"],
      );
    }
    if (episode.steps.length < 2 || episode.trajectory.hadChecks === false) {
      return domainFailure(
        "needs_more_evidence",
        "episodes lack reusable steps and checks",
      );
    }
  }
  const positive = episodes.filter((episode) => episode.outcome === "success");
  const negative = episodes.filter((episode) => episode.outcome === "failure");
  if (positive.length === 0 || negative.length === 0) {
    return domainFailure(
      "needs_more_evidence",
      "skill drafts must keep both success and failure experience",
    );
  }
  const steps = positive[0]?.steps ?? [];
  const checks = uniqueStrings(episodes.flatMap((episode) => episode.checks));
  const failureModes = uniqueStrings(
    negative
      .map((episode) => episode.failureMode)
      .filter((mode): mode is string => mode !== undefined),
  );
  if (failureModes.length === 0) {
    return domainFailure("needs_more_evidence", "failure modes are required");
  }
  const version = Math.max(0, ...existingVersions) + 1;
  const identity = ruleIdentity(steps);
  const id = shortId("sk", [family.id, String(version), identity]);
  const draft: SkillDraft = {
    kind: "skill",
    status: DRAFT_STATUS,
    id,
    name: `${family.intentClass}-method`,
    version,
    trigger: `task family ${family.intentClass} with ${family.checkKind} checks`,
    steps,
    checks,
    failureModes,
    positiveExamples: positive.map((episode) => ({
      episodeId: episode.id,
      outcome: "success",
    })),
    negativeExamples: negative.map((episode) => ({
      episodeId: episode.id,
      outcome: "failure",
    })),
    positiveRules: steps.map((step) => `do: ${step}`),
    negativeRules: failureModes.map((mode) => `avoid: ${mode}`),
    provenance: {
      source: "inferred_from_observations",
      observationRefs: episodes.map((episode) => episode.id),
      createdBy: "skill_inducer",
    },
    scope: { kind: "task_family", id: family.id },
    identity,
    permissionClaim: false,
    command: submitDraftCommand("skill", id),
  };
  return { kind: "draft", draft };
}

function isPhrasingOnly(episode: SkillEpisode | undefined): boolean {
  if (episode === undefined) {
    return true;
  }
  return episode.steps.length <= 1 && episode.trajectory.stepCount <= 1;
}

function uniqueStrings(values: readonly string[]): string[] {
  return [...new Set(values)];
}

export function renderSkillMarkdown(draft: SkillDraft): string {
  return [
    `# ${draft.name} v${draft.version}`,
    `Trigger: ${draft.trigger}`,
    "## Steps",
    ...draft.steps.map((step, index) => `${index + 1}. ${step}`),
    "## Checks",
    ...draft.checks.map((check) => `- ${check}`),
    "## Failure modes",
    ...draft.failureModes.map((mode) => `- ${mode}`),
    "## Positive rules",
    ...draft.positiveRules.map((rule) => `- ${rule}`),
    "## Negative rules",
    ...draft.negativeRules.map((rule) => `- ${rule}`),
  ].join("\n");
}

export function withdrawSkill(id: string): BoardCommandDraft {
  return submitWithdrawCommand("skill", id);
}

export function editSkill(
  draft: SkillDraft,
  patch: { readonly steps?: readonly string[]; readonly checks?: readonly string[] },
): SkillDraft {
  const version = draft.version + 1;
  const steps = patch.steps ?? draft.steps;
  const checks = patch.checks ?? draft.checks;
  const id = shortId("sk", [draft.scope.id, String(version), ruleIdentity(steps)]);
  return {
    ...draft,
    id,
    version,
    steps,
    checks,
    positiveRules: steps.map((step) => `do: ${step}`),
    command: submitDraftCommand("skill", id),
  };
}
