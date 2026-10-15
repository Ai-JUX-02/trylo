import type { ToolPort } from "../ports/tools.js";
import type { Engine } from "./runner-engine.js";
import type { LoopPorts } from "./runner.js";

export const FINAL_REPORT_INSTRUCTIONS = "Final request at this turn's provider-request limit. No tools are available for this request. Give the final response in the user's requested language and format: report actual work done, validation that actually ran, and any unfinished or unverified requirements. Do not claim full completion merely because a budget ended. Return only the user-facing report, without restating instructions or internal planning. Return the report itself, not a plan for more work or tool-call markup. Use the existing tool results; do not perform or propose another verification.";

/** Narrow both the advertised catalog and actual execution. No remembered grant
 * can reopen actions, and even a provider ignoring the empty catalog cannot act.
 * Earlier calls settled before this view is selected; there is nothing to cancel.
 */
const REPORT_TOOLS: ToolPort = {
  snapshot: () => [],
  async execute(_call, signal) {
    return signal.aborted ? { outcome: "cancelled" } : { outcome: "error", code: "tool_unknown", message: "No tools are available in the reserved final report request" };
  },
  async cancel() { return; },
};

export type BudgetIteration = {
  readonly purpose: "work" | "final_report";
  readonly ports: LoopPorts;
};

/** Read the engine's authoritative allowance; no second counter or quality judge.
 * A steer can refund iterations in the existing gap, so select again each time.
 */
export function budgetIteration(engine: Engine, ports: LoopPorts): BudgetIteration {
  if (engine.budget.finalRequest !== "report_only" || engine.iterations + 1 < engine.budget.maxIterations) {
    return { purpose: "work", ports };
  }
  return { purpose: "final_report", ports: { ...ports, tools: REPORT_TOOLS } };
}
