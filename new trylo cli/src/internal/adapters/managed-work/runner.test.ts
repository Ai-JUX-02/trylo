import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import type { JsonValue } from "../../protocol/envelope.js";
import type { ManagedWorkCeiling, ManagedWorkOrder } from "../../ports/managed-work.js";
import { createManagedWorkRunner, type ManagedWorkControl } from "./runner.js";

/**
 * L32 reconnect and receipt-crash harness (WP26 / L32).
 *
 * Three facts the real-machine evidence left open (`08-bg-and-real-order-batch.md`
 * §3: "提交后立刻 kill 客户端、再重连查询" 未跑；回执未落盘崩溃注入未做):
 *
 * 1. Killing the client must not lose the session: a new runner re-reads the
 *    receipt from the backend rather than trusting anything it remembers.
 * 2. A `send` to a session the backend no longer holds converges to
 *    `cancelled` — the requested end-state (nothing left to talk to), terminal
 *    and never retried — rather than a refusal that invites a retry.
 * 3. A `status` read that finds no record is `unknown` for reconciliation, with
 *    artifacts read from disk (possibly empty) and no automatic retry.
 *
 * Every case drives an in-memory control plane through the runner's injection
 * seam. No socket is opened and no process is killed: "killing the client" is
 * dropping the runner and building a second one over the same backend. If the
 * second runner still reads the session, the receipt survived the client
 * because it never lived in it.
 */

type FakeSession = { readonly id: string; status: string };

function fakeControlPlane(projectKey: string) {
  const sessions = new Map<string, FakeSession>();
  const requests: Array<{ readonly method: string }> = [];
  let created = 0;

  function sessionIdOf(params: JsonValue): string | undefined {
    if (typeof params !== "object" || params === null || Array.isArray(params)) {
      return undefined;
    }
    const candidate = (params as Record<string, JsonValue>)["sessionId"];
    return typeof candidate === "string" ? candidate : undefined;
  }

  const control: ManagedWorkControl = {
    request: async (method: string, params: JsonValue): Promise<unknown> => {
      requests.push({ method });
      switch (method) {
        case "workspace.list":
          return { workspaces: [{ id: "w1", path: projectKey }] };
        case "managedEnvironment.list":
          return { environments: [{ id: "managed-env-w1" }] };
        case "managedSession.create": {
          created += 1;
          const id = `s-${created}`;
          sessions.set(id, { id, status: "running" });
          return { session: { id, status: "running" } };
        }
        case "managedSession.get":
        case "managedSession.resume": {
          const session = sessionIdOf(params) === undefined ? undefined : sessions.get(sessionIdOf(params) as string);
          // No `session` key when the backend holds no record: the runner must
          // decide what "no record" means rather than being told.
          return session === undefined ? {} : { session: { id: session.id, status: session.status } };
        }
        case "managedSession.sendEvent": {
          const session = sessionIdOf(params) === undefined ? undefined : sessions.get(sessionIdOf(params) as string);
          return session === undefined ? {} : { session: { id: session.id, status: session.status } };
        }
        case "managedSession.cancel": {
          const id = sessionIdOf(params);
          if (id !== undefined) {
            sessions.delete(id);
          }
          return {};
        }
        case "managedSession.events.list":
          return { events: [] };
        default:
          throw new Error(`unexpected method ${method}`);
      }
    },
  };

  return {
    control,
    requests,
    complete(sessionId: string): void {
      const session = sessions.get(sessionId);
      if (session !== undefined) {
        sessions.set(sessionId, { id: session.id, status: "completed" });
      }
    },
    /** The record is gone without a cancel: crashed cleanup, expiry, whatever. */
    drop(sessionId: string): void {
      sessions.delete(sessionId);
    },
  };
}

const CEILING: ManagedWorkCeiling = {
  level: "workspace_write",
  shell: false,
  network: false,
  browser: false,
  computerUse: false,
};

function order(): ManagedWorkOrder {
  return {
    title: "write the report",
    objective: "produce the quarterly summary",
    inputs: [{ kind: "text", value: "the numbers are in ./data.csv" }],
    scope: { include: ["reports"], exclude: [] },
    deliverables: [{ kind: "file", description: "reports/q3.md" }],
    evidenceRequirements: [],
    completionContract: [],
    budget: {},
    permissionCeiling: CEILING,
    delivery: "background",
  };
}

function runnerFor(control: ManagedWorkControl, projectKey: string) {
  return createManagedWorkRunner({
    controlPlane: control,
    projectKey,
    grantedCeiling: CEILING,
    agentSlug: "test-agent",
    pollIntervalMs: 1,
  });
}

function getsOf(requests: ReadonlyArray<{ readonly method: string }>): number {
  return requests.filter((entry) => entry.method === "managedSession.get").length;
}

test("killing the client does not lose the session: a reconnected runner re-reads it, never from memory", async () => {
  const projectKey = mkdtempSync(join(tmpdir(), "wp26-l32-reconnect-"));
  const backend = fakeControlPlane(projectKey);
  const first = runnerFor(backend.control, projectKey);
  const submitted = await first.submit(order());
  assert.equal(submitted.ok, true);
  if (!submitted.ok) return;
  const sessionId = submitted.value.managedSessionId;
  backend.complete(sessionId);

  // The client dies here: nothing of `first` is reused. A second runner over
  // the same backend must still read the session — the receipt survived the
  // client because it never lived in it.
  const second = runnerFor(backend.control, projectKey);
  const reread = await second.status(sessionId);
  assert.equal(reread.ok, true);
  if (!reread.ok) return;
  assert.equal(reread.value.managedSessionId, sessionId);
  assert.equal(reread.value.status.status, "completed");
  assert.notEqual(reread.value, submitted.value, "a re-read receipt is a new observation, not the remembered object");
  assert.ok(
    backend.requests.some((entry) => entry.method === "managedSession.get"),
    "status went back to the backend instead of trusting memory",
  );
});

test("send to a session the backend no longer has converges to cancelled, not a refusal", async () => {
  const projectKey = mkdtempSync(join(tmpdir(), "wp26-l32-send-gone-"));
  const backend = fakeControlPlane(projectKey);
  const runner = runnerFor(backend.control, projectKey);
  const submitted = await runner.submit(order());
  assert.equal(submitted.ok, true);
  if (!submitted.ok) return;
  const sessionId = submitted.value.managedSessionId;
  backend.drop(sessionId);

  const sent = await runner.send(sessionId, "a follow-up after the record vanished");
  assert.equal(sent.ok, true);
  if (!sent.ok) return;
  // Gone after a send is the requested end-state (nothing left to talk to):
  // terminal, and never retried — the same rule `cancel` already applied to a
  // backend answering with no session.
  assert.equal(sent.value.status.status, "cancelled");
  assert.equal(sent.value.managedSessionId, sessionId);
});

test("an unreadable session reads as unknown for reconciliation, with nothing retried", async () => {
  const projectKey = mkdtempSync(join(tmpdir(), "wp26-l32-unknown-"));
  const backend = fakeControlPlane(projectKey);
  const runner = runnerFor(backend.control, projectKey);
  const submitted = await runner.submit(order());
  assert.equal(submitted.ok, true);
  if (!submitted.ok) return;
  const sessionId = submitted.value.managedSessionId;
  // The effect may or may not have landed before the record vanished — a
  // receipt that was never persisted, a cleanup nobody announced.
  backend.drop(sessionId);

  const before = getsOf(backend.requests);
  const reread = await runner.status(sessionId);
  assert.equal(reread.ok, true);
  if (!reread.ok) return;
  assert.equal(reread.value.status.status, "unknown");
  if (reread.value.status.status !== "unknown") return;
  assert.match(reread.value.status.reason, /reconciliation/);
  // Artifacts are read from disk, not claimed: nothing landed, so none exist.
  assert.deepEqual(reread.value.artifacts, []);
  assert.equal(getsOf(backend.requests) - before, 1, "one observation, no automatic retry");
});
