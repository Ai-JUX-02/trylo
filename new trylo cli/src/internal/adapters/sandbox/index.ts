import type { SandboxVerdict, ToolCallRequest, ToolSandbox } from "../../ports/tools.js";
import type { SandboxPolicy } from "../../ports/tools.js";
import { planMutation } from "./planner.js";
import type { WorkspaceSandboxConfig } from "./policy.js";
import { createSandboxPolicy } from "./policy.js";

/**
 * The execution sandbox.
 *
 * It answers exactly one question — whether this call may be put in front of a
 * human at all — and nothing else. It performs no I/O beyond resolving paths,
 * grants nothing, and never executes: it is the gate in front of both approval
 * and execution, not a participant in either.
 *
 * `workspace_write` is the default because it is the narrowest mode in which
 * the tools this package adds can do their job. `danger_full_access` does not
 * exist here by design.
 */
export function createWorkspaceSandbox(config: WorkspaceSandboxConfig): ToolSandbox {
  const policy: SandboxPolicy = createSandboxPolicy(config);
  const shellMode = config.shellMode;
  return {
    policy,
    evaluate(call: ToolCallRequest): SandboxVerdict {
      const planned = planMutation(policy, call, shellMode);
      if (planned.ok) {
        return { ok: true };
      }
      return { ok: false, code: planned.code, message: planned.message };
    },
  };
}
