import {
  MANAGED_WORK_TERMINAL_STATUSES,
  type ManagedWorkCeiling,
  type ManagedWorkLevel,
  type ManagedWorkOrder,
  type ManagedWorkResult,
  type ManagedWorkState,
  type ManagedWorkStatus,
} from "../ports/managed-work.js";

/**
 * What a managed session is allowed to do, decided before it is told anything
 * (WP26 / L32).
 *
 * ## The one rule: the child is the intersection
 *
 * A delegated session must never hold more authority than the run that delegated
 * to it. Not "roughly the same", not "whatever the backend grants" — the
 * intersection, per capability. Two reasons, and the second is the one that bites:
 *
 *  1. A parent that is read-only must not be able to hand a child write access by
 *     asking nicely.
 *  2. The **backend's own limit** also applies. A request that arrives at the
 *     daemon saying `full_access` on a deployment configured for workspace-only
 *     would be refused there — after the request had already been made, which is
 *     an authorization decision made in the wrong place.
 *
 * So {@link narrowCeiling} takes both and returns their intersection, and it is a
 * pure function so the rule can be tested exhaustively rather than trusted.
 */

/**
 * Level ordering, for the intersection.
 *
 * A list rather than a number because the capability bits below it do not follow
 * from the level: `workspace_write` does not imply the network, and treating it as
 * though it does is how a permission model leaks.
 */
const LEVEL_RANK: Readonly<Record<ManagedWorkLevel, number>> = {
  read_only: 0,
  workspace_write: 1,
  full_access: 2,
};

function narrowestLevel(
  requested: ManagedWorkLevel,
  granted: ManagedWorkLevel,
): ManagedWorkLevel {
  return LEVEL_RANK[requested] <= LEVEL_RANK[granted] ? requested : granted;
}

/**
 * The authority a child actually gets.
 *
 * `requested` is the ceiling the caller asked for; `granted` is what this run is
 * itself permitted to delegate, and what the deployment allows. The result is the
 * lower of the two levels, and the logical AND of the four capability bits.
 */
export function narrowCeiling(
  requested: ManagedWorkCeiling,
  granted: ManagedWorkCeiling,
): ManagedWorkCeiling {
  return {
    level: narrowestLevel(requested.level, granted.level),
    shell: requested.shell && granted.shell,
    network: requested.network && granted.network,
    browser: requested.browser && granted.browser,
    computerUse: requested.computerUse && granted.computerUse,
  };
}

/**
 * Whether a ceiling would let a child do something its parent cannot.
 *
 * Kept as a separate predicate because the refusal it drives has to be phrased:
 * a caller that silently got a narrower ceiling than it asked for would ship a
 * job that quietly cannot do its work, and the person would find out from the
 * result rather than from the refusal.
 */
export function exceedsParent(
  requested: ManagedWorkCeiling,
  granted: ManagedWorkCeiling,
): boolean {
  const narrowed = narrowCeiling(requested, granted);
  return (
    narrowed.level !== requested.level ||
    narrowed.shell !== requested.shell ||
    narrowed.network !== requested.network ||
    narrowed.browser !== requested.browser ||
    narrowed.computerUse !== requested.computerUse
  );
}

/** The order is only usable if it is one the level ranking can compare. */
export function isKnownLevel(value: string): value is ManagedWorkLevel {
  return value === "read_only" || value === "workspace_write" || value === "full_access";
}

/**
 * Validate an order before anything is sent.
 *
 * The scope rule is the one worth stating: an empty `include` with a non-empty
 * `exclude` means "everywhere except these", which sounds harmless and is in fact
 * unbounded — a child that was told to stay out of three paths has been told
 * nothing about the rest of the workspace. It is refused instead.
 */
export function validateOrder(
  order: ManagedWorkOrder,
): ManagedWorkResult<ManagedWorkOrder> {
  if (order.objective.trim().length === 0) {
    return { ok: false, code: "invalid_order", message: "the order has no objective" };
  }
  if (order.scope.include.length === 0 && order.scope.exclude.length > 0) {
    return {
      ok: false,
      code: "invalid_order",
      message:
        "the scope excludes paths but names none to work in, which would let the session write anywhere else; " +
        "list the paths to work in, or neither list",
    };
  }
  if (order.delivery === "wait" && order.budget.timeoutMs === undefined) {
    return {
      ok: false,
      code: "invalid_order",
      message:
        "a `wait` delivery without a timeout can never return; the backend would hold the caller open indefinitely",
    };
  }
  if (order.inputs.length === 0 && order.contextDigest === undefined) {
    return {
      ok: false,
      code: "invalid_order",
      message:
        "the order carries no inputs and no context digest, so the session would be asked to work from a title alone",
    };
  }
  return { ok: true, value: order };
}

/**
 * Map a backend status word to the vocabulary this package uses.
 *
 * The backend has more words than the contract does (`pending`, `awaiting_input`,
 * `interrupted`, …), so the mapping is explicit and total. An unrecognised word
 * becomes `running` rather than a terminal state: a new backend status must never
 * be able to look like a completed run.
 */
export function mapStatus(raw: string | undefined): ManagedWorkStatus {
  switch (raw) {
    case "pending":
    case "queued":
      return "queued";
    case "running":
    case "in_progress":
      return "running";
    case "awaiting_input":
    case "interrupted":
      return "waiting";
    case "completed":
    case "applied":
      return "completed";
    case "failed":
    case "error":
      return "failed";
    case "cancelled":
    case "canceled":
      return "cancelled";
    default:
      // Unrecognised is not terminal. Anything else would let a backend addition
      // read as a finished job.
      return "running";
  }
}

/** Whether this state is one the caller must not retry on its own. */
export function isTerminal(status: ManagedWorkStatus): boolean {
  return MANAGED_WORK_TERMINAL_STATUSES.includes(status);
}

/** One line about where a session stands, for a person reading it. */
export function describeState(state: ManagedWorkState): string {
  switch (state.status) {
    case "queued":
      return "queued; the backend has not started it yet";
    case "running":
      return "running";
    case "waiting":
      return `waiting on you: ${state.description} (request ${state.requestId})`;
    case "completed":
      return state.summary === undefined ? "completed" : `completed: ${state.summary}`;
    case "failed":
      return `failed: ${state.message}`;
    case "cancelled":
      return "cancelled";
    case "unknown":
      // The wording is the point: not "failed", because nothing observed a failure.
      return `outcome not observed (${state.reason}); not retried automatically`;
  }
}
