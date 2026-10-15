import { existsSync, readdirSync, statSync } from "node:fs";
import { join, relative, resolve, sep } from "node:path";

import type { JsonObject, JsonValue } from "../../protocol/envelope.js";
import { asJsonObject, readObject, readString } from "./frame.js";
import { ControlPlaneUnavailableError, isBackendUnreachable } from "./errors.js";
import { mapStatus } from "../../domain/managed-work.js";
import type {
  ManagedWorkCeiling,
  ManagedWorkOrder,
  ManagedWorkReceipt,
  ManagedWorkRefusal,
  ManagedWorkResult,
  ManagedWorkState,
} from "../../ports/managed-work.js";

/**
 * Reading a managed session into a receipt (WP26 / L32).
 *
 * Split out of `runner.ts` under the file-size gate, and split on a boundary the
 * size gate did not invent: this module turns **bytes off the wire and off the
 * disk** into this package's vocabulary, while `runner.ts` decides **what to ask
 * the backend**. Mixing them made one file answer both "what does the daemon say"
 * and "may we delegate this", and the second question needs the first as an input.
 *
 * ## Why artifacts are read from disk rather than taken from the receipt
 *
 * A backend that reports "I wrote three files" is a claim; the files are the fact.
 * So {@link readArtifacts} walks the session's output directory. A session that
 * reported work and left nothing behind comes back with an empty artifact list —
 * which is a real answer, and the one a caller needs in order to decide whether a
 * retry could possibly help.
 */

/** Where a session's deliverables are written. */
export function sessionOutputDir(projectKey: string, sessionId: string): string {
  return resolve(projectKey, ".trylo", "out", "managed", sessionId);
}

/** What a session's output directory actually holds. */
export function readArtifacts(
  projectKey: string,
  sessionId: string,
): ReadonlyArray<{ readonly relativePath: string; readonly kind?: string }> {
  const root = sessionOutputDir(projectKey, sessionId);
  if (!existsSync(root)) {
    return [];
  }
  const base = resolve(projectKey);
  const found: Array<{ relativePath: string; kind?: string }> = [];
  const walk = (dir: string): void => {
    let entries: string[];
    try {
      entries = readdirSync(dir);
    } catch {
      // An unreadable directory reports nothing, and failing the whole walk would
      // hide the directories that did read.
      return;
    }
    for (const entry of entries) {
      const full = join(dir, entry);
      try {
        if (statSync(full).isDirectory()) {
          walk(full);
        } else {
          found.push({
            relativePath: relative(base, full).replaceAll("\\", "/"),
            ...(artifactKind(entry) === undefined ? {} : { kind: artifactKind(entry) as string }),
          });
        }
      } catch {
        // A file that vanished between listing and stat is not an artifact.
      }
    }
  };
  walk(root);
  return found.sort((left, right) => left.relativePath.localeCompare(right.relativePath));
}

function artifactKind(filename: string): string | undefined {
  const extension = filename.split(".").pop()?.toLowerCase();
  return extension !== undefined && ["docx", "xlsx", "pptx", "pdf", "html", "md", "txt", "csv"].includes(extension)
    ? "file"
    : undefined;
}

/**
 * Shape a backend session into this package's state vocabulary.
 *
 * The backend has more words than the contract does (`pending`, `awaiting_input`,
 * `interrupted`, …) so the mapping is explicit and total, and an unrecognised word
 * becomes `running` — never a terminal state, because a backend adding a status
 * must not be able to make a job look finished.
 */
export function stateFromSession(session: JsonObject | undefined): ManagedWorkState {
  const status = mapStatus(readString(session, "status"));
  switch (status) {
    case "waiting": {
      const pending = readObject(session, "pendingAction");
      return {
        status: "waiting",
        requestId: readString(pending, "requestId") ?? "unspecified",
        description: readString(pending, "description") ?? "it needs an answer before it can continue",
      };
    }
    case "completed": {
      const summary = readString(session, "latestSummary");
      return summary === undefined ? { status: "completed" } : { status: "completed", summary };
    }
    case "failed":
      return {
        status: "failed",
        code: readString(session, "errorCode") ?? "backend_reported_failure",
        message: readString(session, "error") ?? "the backend reported a failure",
      };
    case "cancelled":
      return { status: "cancelled" };
    default:
      // `mapStatus` is total, so this is one of the three non-terminal words. The
      // explicit cases below make that visible to the type system rather than
      // relying on the union staying exactly three wide.
      if (status === "queued" || status === "running") {
        return { status };
      }
      return { status: "running" };
  }
}

/** Build a receipt from a backend payload, reading artifacts from disk. */
export function receiptFrom(
  payload: unknown,
  projectKey: string,
  fallbackSessionId: string,
): ManagedWorkReceipt {
  const session = readObject(asJsonObject(payload), "session");
  const id = readString(session, "id") ?? fallbackSessionId;
  return {
    childId: `managed-${id}`,
    managedSessionId: id,
    status: stateFromSession(session),
    artifacts: readArtifacts(projectKey, id),
    evidence: [],
  };
}

/** A receipt for a session the backend says no longer exists. */
export function cancelledReceipt(projectKey: string, sessionId: string): ManagedWorkReceipt {
  return {
    childId: `managed-${sessionId}`,
    managedSessionId: sessionId,
    status: { status: "cancelled" },
    artifacts: readArtifacts(projectKey, sessionId),
    evidence: [],
  };
}

/**
 * A receipt for a session the backend holds no record of.
 *
 * Read, not told: a `status` query answered with no session cannot claim
 * anything ran. The effect may or may not have landed — a receipt never
 * persisted, a record expired or cleaned up — so this is `unknown`, neither
 * `cancelled` nor `failed`. It goes to reconciliation and is never retried
 * automatically: retrying work nobody observed is how an effect lands twice.
 */
export function unknownReceipt(projectKey: string, sessionId: string, reason: string): ManagedWorkReceipt {
  return {
    childId: `managed-${sessionId}`,
    managedSessionId: sessionId,
    status: { status: "unknown", reason },
    artifacts: readArtifacts(projectKey, sessionId),
    evidence: [],
  };
}

/**
 * Match a project path to the workspace the backend lists for it.
 *
 * Prefix match with a case-insensitive comparison on Windows, because `D:\Work`
 * and `d:\work` are one directory there — and a case-sensitive comparison leaves
 * the session with no environment, which used to be reported as "the backend is
 * unavailable", sending a person to restart something that was running perfectly.
 */
export function matchWorkspace(
  workspaces: ReadonlyArray<JsonObject>,
  projectKey: string,
): JsonObject | undefined {
  const compare = (candidate: string): string =>
    process.platform === "win32" ? candidate.toLowerCase() : candidate;
  const target = compare(resolve(projectKey));
  for (const workspace of workspaces) {
    const path = readString(workspace, "path");
    if (path === undefined) {
      continue;
    }
    const normalized = compare(resolve(path));
    if (target === normalized || target.startsWith(`${normalized}${sep}`)) {
      return workspace;
    }
  }
  return undefined;
}

/** The environment whose id or config names this workspace. */
export function matchEnvironment(
  environments: ReadonlyArray<JsonObject>,
  workspaceId: string | undefined,
): string | undefined {
  for (const environment of environments) {
    const id = readString(environment, "id");
    if (id === undefined) {
      continue;
    }
    if (id === `managed-env-${workspaceId}` || readString(readObject(environment, "config"), "workspaceId") === workspaceId) {
      return id;
    }
  }
  return undefined;
}

/** One line describing an authority, for a refusal a person has to act on. */
export function describeCeiling(ceiling: ManagedWorkCeiling): string {
  const bits = [
    ceiling.shell ? "shell" : null,
    ceiling.network ? "network" : null,
    ceiling.browser ? "browser" : null,
    ceiling.computerUse ? "computer-use" : null,
  ].filter((bit) => bit !== null);
  return bits.length === 0 ? `${ceiling.level}, no capabilities` : `${ceiling.level} with ${bits.join(" + ")}`;
}

/**
 * Turn any transport failure into the refusal it actually is.
 *
 * The distinction is the point of this package: "the daemon is not running" and
 * "the daemon said no" send a person to opposite places — start a service, or fix
 * a request — so they are different codes rather than one "unavailable".
 */
export function refusalFrom(error: unknown, what: string): ManagedWorkRefusal {
  if (error instanceof ControlPlaneUnavailableError) {
    if (error.code === "unauthorized") {
      return {
        ok: false,
        code: "backend_refused",
        message: `the backend rejected this client's token while ${what}: ${error.message}`,
      };
    }
    if (isBackendUnreachable(error)) {
      return {
        ok: false,
        code: "backend_unavailable",
        message: `the managed-work backend is not reachable (${what}): ${error.message}`,
      };
    }
    return { ok: false, code: "backend_refused", message: `${what}: ${error.message}` };
  }
  return {
    ok: false,
    code: "backend_unavailable",
    message: `${what}: ${error instanceof Error ? error.message : String(error)}`,
  };
}

/** Narrow an unknown array field to JSON objects, dropping anything else. */
export function rowsOf(payload: unknown, key: string): ReadonlyArray<JsonObject> {
  const field = asJsonObject(payload)?.[key];
  if (!Array.isArray(field)) {
    return [];
  }
  const rows: Array<JsonObject> = [];
  for (const entry of field as ReadonlyArray<JsonValue>) {
    const record = asJsonObject(entry);
    if (record !== undefined) {
      rows.push(record);
    }
  }
  return rows;
}

/**
 * Poll until the session reaches a terminal state.
 *
 * A timeout is an **observation gap**, not a failure and not a success, so it
 * returns `unknown`. That is the whole reason the state exists: a run whose result
 * nobody saw must not be retried by whoever notices the timeout first.
 */
export async function pollUntilTerminal(
  status: (sessionId: string) => Promise<ManagedWorkResult<ManagedWorkReceipt>>,
  sessionId: string,
  timeoutMs: number,
  pollIntervalMs: number,
  /**
   * The clock. Injected because a test asserting "it stopped polling at the
   * deadline" must not spend the deadline waiting for it — and because a caller
   * with its own clock should not get a second, slightly different one.
   * The `?? 0` is the repository's required shape for an ambient default; it is
   * never reachable, because `Date.now()` is always a number.
   */
  now: () => number = Date.now ?? 0,
  sleep: (ms: number) => Promise<void> = (ms) => new Promise((resolveSleep) => setTimeout(resolveSleep, ms)),
): Promise<ManagedWorkResult<ManagedWorkReceipt>> {
  const deadline = now() + timeoutMs;
  for (;;) {
    const current = await status(sessionId);
    if (!current.ok) {
      return current;
    }
    const state = current.value.status.status;
    if (state !== "queued" && state !== "running") {
      return current;
    }
    if (now() >= deadline) {
      return {
        ok: true,
        value: {
          ...current.value,
          status: { status: "unknown", reason: `no terminal state within ${timeoutMs}ms` },
        },
      };
    }
    await sleep(pollIntervalMs);
  }
}

/**
 * Build the initial user message from an order. The daemon composes the rest from
 * the agent's own prompt, so this is only what the order itself carries.
 */
export function buildObjective(order: ManagedWorkOrder): string {
  const parts: string[] = [`# ${order.title}`, "", order.objective.trim()];
  if (order.contextDigest !== undefined) {
    parts.push("", "## Context", order.contextDigest.trim());
  }
  if (order.inputs.length > 0) {
    parts.push("", "## Inputs");
    for (const input of order.inputs) {
      parts.push(input.kind === "text" ? `- ${input.value.trim()}` : `- workspace file: ${input.relativePath}`);
    }
  }
  if (order.deliverables.length > 0) {
    parts.push("", "## Deliverables");
    for (const deliverable of order.deliverables) {
      const hint = deliverable.relativePathHint === undefined ? "" : ` (${deliverable.relativePathHint})`;
      parts.push(`- [${deliverable.kind}] ${deliverable.description}${hint}`);
    }
  }
  if (order.completionContract.length > 0) {
    parts.push("", "## Acceptance criteria");
    for (const line of order.completionContract) {
      parts.push(`- ${line.trim()}`);
    }
  }
  if (order.evidenceRequirements.length > 0) {
    parts.push("", "## Evidence required");
    for (const line of order.evidenceRequirements) {
      parts.push(`- ${line.trim()}`);
    }
  }
  return parts.join("\n");
}

/** Narrow an unknown payload to a JSON object, for the port's `events` verb. */
export function jsonRows(value: unknown): ReadonlyArray<JsonObject> {
  return rowsOf(value, "events");
}
