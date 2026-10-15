import { RUN_SHELL_TOOL } from "../../adapters/tools/mutating/names.js";
import { planShellPipeline } from "../../adapters/sandbox/command.js";
import {
  dangerousCommandMatch,
  evaluateExecPolicy,
  parseExecPolicyDocument,
  strictest,
  unmatchedCommandDecision,
  type ApprovalPosture,
  type ExecDecision,
  type ExecPolicy,
  type PolicyParseFailure,
  type PolicySource,
  type SourcePlatform,
} from "../../domain/exec-policy/index.js";
import type { ExecPolicyGuard, ToolAdmissionRequest } from "../../loop/tool-admission.js";
import type { AskPolicy } from "./permission-plan.js";

/**
 * Where the command policy meets this CLI (C66/L64).
 *
 * The guard answers only two things and stays silent otherwise: a written-down
 * *forbidden* is final, a written-down *allow* runs without a prompt, and
 * anything else — including every "the policy has no opinion" case — is handed
 * back to the permission chain that already existed. Silence here therefore
 * means "ask whoever was going to be asked anyway", and installing this guard
 * can only narrow what the CLI runs, never widen it.
 *
 * That is also why a policy **load failure** refuses to install rather than
 * installing a guard that decides nothing: a policy that quietly stopped
 * applying looks exactly like a policy that was obeyed.
 */

export type ExecPolicyGuardConfig = {
  readonly platform: SourcePlatform;
  readonly ask: AskPolicy;
  readonly workspaceRoot: string;
  readonly allowAbsoluteExecutable: boolean;
};

export type ExecPolicyGuardResult =
  | { readonly ok: true; readonly guard: ExecPolicyGuard }
  | { readonly ok: false; readonly failures: ReadonlyArray<PolicyParseFailure> };

/**
 * `--ask` has no third gear today: there is no CLI answer to "may this run
 * without asking?" beyond the explicit tool lists, so every unmatched command
 * falls to a person, and a non-interactive run keeps refusing as it always has.
 * `on_request` stays in the domain for the day a host wants that gear, and is
 * deliberately not reachable from here.
 */
function postureFor(ask: AskPolicy): ApprovalPosture {
  return ask === "never" ? "never" : "unless_trusted";
}

function commandArgumentOf(call: ToolAdmissionRequest): string | undefined {
  if (call.name !== RUN_SHELL_TOOL) {
    return undefined;
  }
  const raw = call.arguments["command"];
  return typeof raw === "string" && raw.trim().length > 0 ? raw : undefined;
}

function decisionForSegment(
  policy: ExecPolicy,
  argv: ReadonlyArray<string>,
  config: ExecPolicyGuardConfig,
): ExecDecision {
  return evaluateExecPolicy(
    policy,
    argv,
    { platform: config.platform, resolveHostExecutables: true },
    (unmatched) =>
      unmatchedCommandDecision({
        dangerous: dangerousCommandMatch(unmatched, config.platform) !== undefined,
        posture: postureFor(config.ask),
        requestsSandboxOverride: false,
      }),
  ).decision;
}

/** The most severe answer across every pipeline segment: a pipe is only as
 * admissible as its least admissible half. */
function decisionForCommand(
  policy: ExecPolicy,
  command: string,
  config: ExecPolicyGuardConfig,
): ExecDecision | undefined {
  const planned = planShellPipeline(
    { workspaceRoot: config.workspaceRoot, allowAbsoluteExecutable: config.allowAbsoluteExecutable },
    command,
  );
  if (!planned.ok) {
    return undefined;
  }
  let decision: ExecDecision | undefined;
  for (const segment of planned.segments) {
    const next = decisionForSegment(policy, segment.argv, config);
    decision = decision === undefined ? next : strictest(decision, next);
  }
  return decision;
}

export function buildExecPolicyGuard(
  config: ExecPolicyGuardConfig,
  source: PolicySource,
): ExecPolicyGuardResult {
  const parsed = parseExecPolicyDocument(source, config.platform);
  if (!parsed.ok) {
    return { ok: false, failures: parsed.failures };
  }
  const guard: ExecPolicyGuard = (call) => {
    const command = commandArgumentOf(call);
    if (command === undefined) {
      return undefined;
    }
    const decision = decisionForCommand(parsed.policy, command, config);
    if (decision === undefined || decision === "prompt") {
      return undefined;
    }
    if (decision === "allow") {
      return { kind: "approved" };
    }
    return {
      kind: "denied",
      code: "exec_policy_forbidden",
      message: `refused by the execution policy: ${command}`,
    };
  };
  return { ok: true, guard };
}
