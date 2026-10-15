import { err, ok, type Result } from "../contract/result.js";
import type {
  ApprovalConsumptionFailure,
  ApprovalConsumptionOutcome,
  ApprovalConsumptionPort,
  ApprovalConsumptionReceipt,
  ApprovalConsumptionRequest,
} from "../../ports/approval-consumption.js";

export type {
  ApprovalConsumptionFailure,
  ApprovalConsumptionPort,
  ApprovalConsumptionReceipt,
  ApprovalConsumptionRequest,
  ApprovalGrantRef,
  PermissionGrant,
} from "../../ports/approval-consumption.js";

/**
 * Tooling-side gate. Failure codes coming back from an injected port, plus
 * `no_port`, which means the call site was never given an authorization
 * backend at all — the most dangerous state, because without it a token check
 * could be silently skipped.
 */
export type ApprovalGateFailure = ApprovalConsumptionFailure | "no_port";

/**
 * The only way Tooling may consume an authorization: a grant reference that
 * the injected Permission store can verify. Tooling never presents its own
 * authorization facts — those live in the store.
 */
export async function consumeApproval(
  port: ApprovalConsumptionPort | undefined,
  request: ApprovalConsumptionRequest,
): Promise<Result<ApprovalConsumptionReceipt, ApprovalGateFailure>> {
  if (port === undefined) {
    return err("no_port", "no approval consumption port was injected; Tooling cannot self-authorize");
  }
  try {
    const outcome: ApprovalConsumptionOutcome = await port.consume(request);
    if (outcome.ok) {
      return ok(outcome.value);
    }
    return err(outcome.code, outcome.message);
  } catch (error) {
    // A port that throws or rejects violates the explicit Outcome contract.
    // Normalize it into a failed consumption (audit P1-6) so no protected call
    // site ever sees a raw exception as its authorization result.
    const message = error instanceof Error ? error.message : String(error);
    return err("ledger_write_failed", `approval port violated its outcome contract: ${message}`);
  }
}
