import type { JsonObject } from "../protocol/envelope.js";

/**
 * Delegating durable work to a managed backend (WP26 / L32).
 *
 * ## What this is, and what it is not
 *
 * A managed session is work that **outlives the turn that asked for it**. The main
 * agent hands over a work order; a backend runs it; the main agent gets a receipt.
 * That is the whole idea, and it is not a subagent: a subagent runs inside this
 * process and dies with it, while a managed session keeps going after the CLI has
 * exited.
 *
 * The distinction matters for one rule in particular — **the receipt is an
 * observation, not a promise**. A backend that is unreachable, a run whose outcome
 * nobody saw, and a run that genuinely failed are three different facts, and
 * collapsing them is how a report ends up claiming work succeeded that never ran.
 * `ManagedWorkOutcome` keeps them apart.
 *
 * ## Reuse, and what was verified rather than assumed
 *
 * Mechanical reuse of old CLI `tools/AgentTool/managed-work/` (1099 lines:
 * `workdControlPlaneClient.ts`, `CoworkManagedAgentRunner.ts`,
 * `managedWorkTypes.ts`, `agentToolManagedWork.ts`).
 *
 * The ADR asked for the daemon to be *run* before its shape could be relied on,
 * and it was — see `evidence/2026-10-07-WP26-review/workd-business.out.txt`:
 *
 *  - the control plane listens on **WebSocket**, the same transport the old
 *    client speaks, and answers with the same `{type:"res", ok, error}` frame;
 *  - a handshake returns `{"role":"operator","scopes":["admin"]}`;
 *  - `workspace.list` and `managedEnvironment.list` returned **real data**;
 *  - the other six answered `INVALID_PARAMS` naming the missing field — which is
 *    the method existing, not the method being absent.
 *
 * So no protocol adapter is needed. What is needed is the *policy* the old source
 * hard-coded, and that is what this port states instead.
 */

/** What may be delegated. */
export const MANAGED_WORK_LEVELS = ["read_only", "workspace_write", "full_access"] as const;
export type ManagedWorkLevel = (typeof MANAGED_WORK_LEVELS)[number];

/**
 * The child's authority, as an explicit set of capabilities.
 *
 * A level alone is not enough to reason about, because the interesting refusals are
 * per-capability: a session may be allowed to write the workspace and still not be
 * allowed to reach the network. Stating them separately is what makes "the child's
 * authority is the intersection of the parent's and the backend's" checkable.
 */
export type ManagedWorkCeiling = {
  readonly level: ManagedWorkLevel;
  readonly shell: boolean;
  readonly network: boolean;
  readonly browser: boolean;
  readonly computerUse: boolean;
};

/**
 * How the main agent wants the result.
 *
 * `background` returns as soon as the session exists; `wait` polls to a terminal
 * state. They are different promises, so they are different values — a boolean
 * `wait` flag would be the same information with less meaning at the call site.
 */
export type ManagedWorkDelivery = "background" | "wait";

/**
 * Where a managed session stands.
 *
 * `cancelled` and `failed` are both terminal, and so is `unknown` — a state the
 * system can genuinely be in when the effect may or may not have landed. It is
 * separate from `failed` because a failure invites a retry and a retry re-does an
 * effect nobody observed; it is separate from `completed` because nobody has said
 * it worked.
 */
export const MANAGED_WORK_STATUSES = [
  "queued",
  "running",
  "waiting",
  "completed",
  "failed",
  "cancelled",
  "unknown",
] as const;
export type ManagedWorkStatus = (typeof MANAGED_WORK_STATUSES)[number];

export const MANAGED_WORK_TERMINAL_STATUSES: ReadonlyArray<ManagedWorkStatus> = [
  "completed",
  "failed",
  "cancelled",
  "unknown",
];

/** A state the system can be in and must not paper over. */
export type ManagedWorkState =
  | { readonly status: "queued" }
  | { readonly status: "running" }
  /** Parked on an approval or a question; the main agent has to answer. */
  | { readonly status: "waiting"; readonly requestId: string; readonly description: string }
  | { readonly status: "completed"; readonly summary?: string }
  | { readonly status: "failed"; readonly code: string; readonly message: string }
  | { readonly status: "cancelled" }
  /** The effect may or may not have landed. Not a failure, not a success. */
  | { readonly status: "unknown"; readonly reason: string };

/** What the main agent hands over. Never the whole conversation. */
export type ManagedWorkOrder = {
  readonly title: string;
  readonly objective: string;
  /** A digest of what the child needs to know; the transcript stays behind. */
  readonly contextDigest?: string;
  readonly inputs: ReadonlyArray<
    | { readonly kind: "text"; readonly value: string }
    | { readonly kind: "workspace_file"; readonly relativePath: string }
  >;
  /** Where the child may write. Empty include with a non-empty exclude is refused. */
  readonly scope: { readonly include: ReadonlyArray<string>; readonly exclude: ReadonlyArray<string> };
  readonly deliverables: ReadonlyArray<{
    readonly kind: "file" | "answer" | "report";
    readonly description: string;
    readonly relativePathHint?: string;
  }>;
  /** What the child must show to claim the work is done. */
  readonly evidenceRequirements: ReadonlyArray<string>;
  readonly completionContract: ReadonlyArray<string>;
  readonly budget: { readonly maxTurns?: number; readonly maxTokens?: number; readonly timeoutMs?: number };
  /**
   * The **ceiling**, not the grant. What the child actually gets is the
   * intersection of this and the backend's own limits — see
   * `narrowCeiling` in the domain module, which is where that rule lives.
   */
  readonly permissionCeiling: ManagedWorkCeiling;
  readonly delivery: ManagedWorkDelivery;
};

/** What came back. */
export type ManagedWorkReceipt = {
  readonly childId: string;
  readonly managedSessionId: string;
  readonly status: ManagedWorkState;
  /** Files the child produced, relative to the workspace. */
  readonly artifacts: ReadonlyArray<{ readonly relativePath: string; readonly kind?: string }>;
  readonly evidence: ReadonlyArray<{ readonly label: string; readonly source?: string }>;
};

/**
 * Why a delegation was refused, or why it could not be established.
 *
 * `backend_unavailable` is the one that must never be dressed up as success: a
 * person who asked for durable work and got a cheerful "done" will not check again,
 * and the work will not happen.
 */
export type ManagedWorkFailureCode =
  /** The backend could not be reached or did not answer the handshake. */
  | "backend_unavailable"
  /** The backend answered but does not offer a managed environment to run in. */
  | "no_managed_environment"
  /** The requested authority exceeds what the parent may delegate. */
  | "permission_ceiling_exceeded"
  /** The order itself is unusable (blank objective, contradictory scope). */
  | "invalid_order"
  /** The backend refused for a reason it named. */
  | "backend_refused"
  /** The run's outcome could not be observed. */
  | "outcome_unknown";

export type ManagedWorkRefusal = {
  readonly ok: false;
  readonly code: ManagedWorkFailureCode;
  readonly message: string;
};

export type ManagedWorkResult<T> = { readonly ok: true; readonly value: T } | ManagedWorkRefusal;

/**
 * The clock and id seam. Nothing ambient, so a test can say exactly which session
 * is which without waiting.
 */
export type ManagedWorkClock = {
  readonly now: () => number;
};

/**
 * What a caller can do with a managed session.
 *
 * Every mutating verb takes the same session id the receipt carries, and every one
 * of them can fail in the same way — so the failures are one union rather than
 * eight copies of "it did not work".
 */
export type ManagedWorkPort = {
  /** Hand over an order; returns as soon as the session exists. */
  readonly submit: (order: ManagedWorkOrder) => Promise<ManagedWorkResult<ManagedWorkReceipt>>;
  /** The authoritative state, read from the backend rather than remembered. */
  readonly status: (sessionId: string) => Promise<ManagedWorkResult<ManagedWorkReceipt>>;
  /** A follow-up message into the *same* session; never a second one. */
  readonly send: (sessionId: string, text: string) => Promise<ManagedWorkResult<ManagedWorkReceipt>>;
  /** Answer a pending approval or question. */
  readonly answer: (
    sessionId: string,
    requestId: string,
    answers?: JsonObject,
  ) => Promise<ManagedWorkResult<ManagedWorkReceipt>>;
  /** Ask to resume a stopped session; not a restart from scratch. */
  readonly resume: (sessionId: string) => Promise<ManagedWorkResult<ManagedWorkReceipt>>;
  /** Stop it. The receipt says whether the stop was accepted, not whether it happened. */
  readonly cancel: (sessionId: string) => Promise<ManagedWorkResult<ManagedWorkReceipt>>;
  /** The compressed timeline — status changes and the final summary, not every turn. */
  readonly events: (sessionId: string, limit?: number) => Promise<ManagedWorkResult<ReadonlyArray<JsonObject>>>;
};
