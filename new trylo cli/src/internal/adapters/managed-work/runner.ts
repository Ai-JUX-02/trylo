import type { JsonObject, JsonValue } from "../../protocol/envelope.js";
import { exceedsParent, narrowCeiling, validateOrder } from "../../domain/managed-work.js";
import {
  buildObjective,
  cancelledReceipt,
  describeCeiling,
  jsonRows,
  matchEnvironment,
  matchWorkspace,
  pollUntilTerminal,
  receiptFrom,
  refusalFrom,
  rowsOf,
  unknownReceipt,
} from "./receipt.js";
import type {
  ManagedWorkCeiling,
  ManagedWorkOrder,
  ManagedWorkPort,
  ManagedWorkReceipt,
  ManagedWorkResult,
} from "../../ports/managed-work.js";

/**
 * Submitting and following durable work (WP26 / L32).
 *
 * Mechanical reuse of old CLI `tools/AgentTool/managed-work/CoworkManagedAgentRunner.ts`
 * (sha256 prefix `42aac09803f8`, 416 lines) and `agentToolManagedWork.ts`
 * (`2a744765661b`, 213 lines). Two things changed, and both are about where a
 * decision is made:
 *
 *  - **The permission ceiling is computed, not trusted.** The old source mapped the
 *    parent mode to a ceiling and sent it. This one intersects that with what the
 *    run may delegate *and* with what the backend offers
 *    (`domain/managed-work.ts::narrowCeiling`), and **refuses** rather than
 *    silently narrowing — a caller that quietly got less would ship work that
 *    cannot succeed and learn it from the result.
 *  - **Every environment failure names itself.** "The daemon is not running" and
 *    "the backend has no managed environment for this project" send a person to
 *    different places, and the old source reported both as the same error.
 *
 * This file decides *what to ask*; `receipt.ts` turns the answers into this
 * package's vocabulary. The split is why both fit under the size gate without
 * either being carved up mid-method.
 */

export type ManagedWorkRunnerOptions = {
  readonly controlPlane: ManagedWorkControl;
  /** This run's workspace root; used to pick the environment and read artifacts. */
  readonly projectKey: string;
  /** What this run may delegate. Intersected with the order's ceiling. */
  readonly grantedCeiling: ManagedWorkCeiling;
  /** The agent slug the backend knows this workspace's sessions by. */
  readonly agentSlug: string;
  readonly pollIntervalMs?: number;
};

/**
 * The control-plane seam the runner speaks to (WP26 / L32).
 *
 * Structural rather than the concrete client, so a test can inject an
 * in-memory backend without opening a socket or killing a process — and so a
 * reconnect is just a second runner over the same seam. The concrete
 * `ManagedWorkControlPlane` satisfies this structurally.
 */
export type ManagedWorkControl = {
  readonly request: (method: string, params: JsonValue) => Promise<unknown>;
};

const DEFAULT_POLL_INTERVAL_MS = 1_000;

export function createManagedWorkRunner(options: ManagedWorkRunnerOptions): ManagedWorkPort {
  const pollIntervalMs = options.pollIntervalMs ?? DEFAULT_POLL_INTERVAL_MS;

  /**
   * Find the managed environment for this workspace, or say which of the two
   * things is missing. Both are separate codes because they are separate repairs.
   */
  async function resolveEnvironmentId(): Promise<ManagedWorkResult<string>> {
    let workspaces: unknown;
    try {
      workspaces = await options.controlPlane.request("workspace.list", {});
    } catch (error: unknown) {
      return refusalFrom(error, "listing workspaces");
    }
    const workspace = matchWorkspace(rowsOf(workspaces, "workspaces"), options.projectKey);
    if (workspace === undefined) {
      return {
        ok: false,
        code: "no_managed_environment",
        message:
          `the backend lists no workspace covering ${options.projectKey}; the project has to be registered ` +
          "there before managed work can run",
      };
    }

    let environments: unknown;
    try {
      environments = await options.controlPlane.request("managedEnvironment.list", {});
    } catch (error: unknown) {
      return refusalFrom(error, "listing managed environments");
    }
    const workspaceId = workspace["id"];
    const matched = matchEnvironment(
      rowsOf(environments, "environments"),
      typeof workspaceId === "string" ? workspaceId : undefined,
    );
    if (matched === undefined) {
      return {
        ok: false,
        code: "no_managed_environment",
        message: `the backend has no managed environment for this workspace (agent ${options.agentSlug})`,
      };
    }
    return { ok: true, value: matched };
  }

  /** One event into a session; shared by `send` and `answer`. */
  async function sendEvent(
    sessionId: string,
    event: JsonObject,
  ): Promise<ManagedWorkResult<ManagedWorkReceipt>> {
    let payload: unknown;
    try {
      payload = await options.controlPlane.request("managedSession.sendEvent", { sessionId, event });
    } catch (error: unknown) {
      return refusalFrom(error, `sending to session ${sessionId}`);
    }
    const session = (payload as { session?: unknown } | null)?.session;
    if (session === undefined) {
      // No record of the session after a send: nothing left to talk to, which
      // is the requested end-state rather than a failure. Terminal, and never
      // retried — the same rule `cancel` already applies below.
      return { ok: true, value: cancelledReceipt(options.projectKey, sessionId) };
    }
    return { ok: true, value: receiptFrom(payload, options.projectKey, sessionId) };
  }

  const port: ManagedWorkPort = {
    async submit(order: ManagedWorkOrder) {
      const valid = validateOrder(order);
      if (!valid.ok) {
        return valid;
      }
      // Refuse rather than narrow: see the file comment.
      if (exceedsParent(order.permissionCeiling, options.grantedCeiling)) {
        return {
          ok: false,
          code: "permission_ceiling_exceeded",
          message:
            `this run may delegate ${describeCeiling(options.grantedCeiling)}, and the order asked for ` +
            `${describeCeiling(order.permissionCeiling)}`,
        };
      }
      const environmentId = await resolveEnvironmentId();
      if (!environmentId.ok) {
        return environmentId;
      }

      let payload: unknown;
      try {
        payload = await options.controlPlane.request("managedSession.create", {
          agentId: options.agentSlug,
          environmentId: environmentId.value,
          title: order.title,
          initialEvent: {
            type: "user.message",
            content: [
              {
                type: "text",
                text: buildObjective({ ...order, permissionCeiling: narrowCeiling(order.permissionCeiling, options.grantedCeiling) }),
              },
            ],
          },
        });
      } catch (error: unknown) {
        return refusalFrom(error, "creating the managed session");
      }
      const receipt = receiptFrom(payload, options.projectKey, "");
      if (order.delivery === "background") {
        return { ok: true, value: receipt };
      }
      // A `wait` with no timeout was already refused by `validateOrder`, so this
      // cannot become a wait that never returns.
      return pollUntilTerminal(
        (sessionId) => port.status(sessionId),
        receipt.managedSessionId,
        order.budget.timeoutMs ?? 0,
        pollIntervalMs,
      );
    },

    async status(sessionId) {
      let payload: unknown;
      try {
        payload = await options.controlPlane.request("managedSession.get", { sessionId });
      } catch (error: unknown) {
        return refusalFrom(error, `reading session ${sessionId}`);
      }
      // A read that finds no record cannot claim anything ran: the effect is
      // unobservable, so it goes to reconciliation as `unknown` and is never
      // retried automatically. Artifacts still come from disk, not from memory.
      const session = (payload as { session?: unknown } | null)?.session;
      if (session === undefined) {
        return {
          ok: true,
          value: unknownReceipt(
            options.projectKey,
            sessionId,
            `the backend holds no record of session ${sessionId}; the effect could not be observed, ` +
              "so this goes to reconciliation rather than a retry",
          ),
        };
      }
      return { ok: true, value: receiptFrom(payload, options.projectKey, sessionId) };
    },

    async send(sessionId, text) {
      return sendEvent(sessionId, { type: "user.message", content: [{ type: "text", text }] });
    },

    async answer(sessionId, requestId, answers) {
      return sendEvent(sessionId, {
        type: "input.received",
        requestId,
        ...(answers === undefined ? {} : { answers }),
      });
    },

    async resume(sessionId) {
      let payload: unknown;
      try {
        payload = await options.controlPlane.request("managedSession.resume", { sessionId });
      } catch (error: unknown) {
        return refusalFrom(error, `resuming session ${sessionId}`);
      }
      return { ok: true, value: receiptFrom(payload, options.projectKey, sessionId) };
    },

    async cancel(sessionId) {
      let payload: unknown;
      try {
        payload = await options.controlPlane.request("managedSession.cancel", { sessionId });
      } catch (error: unknown) {
        return refusalFrom(error, `cancelling session ${sessionId}`);
      }
      // A backend answering "no such session" is a real answer, not a failure: the
      // session it was asked to cancel is not there, which is the requested state.
      const session = (payload as { session?: unknown } | null)?.session;
      if (session === undefined) {
        return { ok: true, value: cancelledReceipt(options.projectKey, sessionId) };
      }
      return { ok: true, value: receiptFrom(payload, options.projectKey, sessionId) };
    },

    async events(sessionId, limit) {
      let payload: unknown;
      try {
        payload = await options.controlPlane.request("managedSession.events.list", {
          sessionId,
          limit: limit ?? 500,
        });
      } catch (error: unknown) {
        return refusalFrom(error, `listing events for ${sessionId}`);
      }
      return { ok: true, value: jsonRows(payload) };
    },
  };
  return port;
}
