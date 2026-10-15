/**
 * Turning one refusal into one question (C65).
 *
 * Source of the semantics: Codex `core/src/tools/orchestrator.rs:313-442` at
 * commit `73a1148c9c775c2a4616ce5096291740a00ed68a`. What is copied is the shape
 * of the decision and, above all, its guard chain: upstream refuses to escalate
 * unless every one of "this really is a sandbox denial", "this tool may be
 * retried", and "the operator wants to be asked" holds - and then it asks
 * *again* rather than reusing the answer that produced the refusal.
 *
 * Which refusals may be escalated here, and why:
 *
 *  - `path_outside_workspace` is a boundary somebody drew. Moving it for one
 *    call is a decision a person can take, so asking is meaningful.
 *  - everything else is not a boundary but a fact: a symbolic link that leaves
 *    the workspace, a path that cannot be verified, a missing parent directory,
 *    or a request this CLI does not implement at all (`cd`, shell operators). A
 *    person agreeing to those would be agreeing to nothing.
 */

import type { JsonObject } from "../protocol/envelope.js";

/**
 * What a caller holds: an opaque reference into whoever issued it.
 *
 * An escalation must not be self-describing, for the reason the durable grant
 * ledger already records: a caller presenting its own authorization object is a
 * caller writing its own permission slip. Every fact about what was released
 * lives with the issuer and is read back there.
 */
export type EscalationTicket = {
  readonly ticketId: string;
};

export type EscalationInput = {
  readonly toolCallId: string;
  readonly name: string;
  /**
   * The whole call, not a selected field: which argument a refusal is *about* is
   * the issuer's business, and picking one here would put this module in the
   * position of deciding that `path` is the interesting key for every tool.
   */
  readonly arguments: JsonObject;
  readonly code: string;
  readonly message: string;
};

export type EscalationOutcome =
  | { readonly ok: true; readonly ticket: EscalationTicket }
  | { readonly ok: false; readonly reason: "denied" | "cancelled" | "failed"; readonly message: string };

/**
 * The one owner of an escalation's lifetime.
 *
 * `request` puts the second question - carrying the refusal it is asking about,
 * which the plain permission port cannot carry. `redeem` answers whether a
 * presented reference still releases this refusal of this value, and consumes it
 * in the same breath: reading and releasing are one action so that nothing can
 * observe a live ticket without spending it.
 *
 * A ticket is single-use and bound to the call it was issued for, which is also
 * what stops being refused from turning into a loop: the second attempt carries
 * the answer instead of asking again.
 */
export type EscalationAuthority = {
  request(input: EscalationInput): Promise<EscalationOutcome>;
  redeem(ticket: EscalationTicket | undefined, input: EscalationInput): boolean;
};

const ESCALATABLE_REFUSALS: ReadonlySet<string> = new Set(["path_outside_workspace"]);

/**
 * Answered by this package because the classification is a property of the
 * sandbox's refusals, not of whoever happens to be asked about one.
 */
export function isEscalatableRefusal(code: string): boolean {
  return ESCALATABLE_REFUSALS.has(code);
}
