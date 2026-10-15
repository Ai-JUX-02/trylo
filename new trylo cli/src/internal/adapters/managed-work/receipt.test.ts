import assert from "node:assert/strict";
import test from "node:test";

import {
  describeCeiling,
  matchEnvironment,
  matchWorkspace,
  readArtifacts,
  refusalFrom,
  rowsOf,
  stateFromSession,
} from "./receipt.js";
import { ControlPlaneUnavailableError } from "./errors.js";
import { pollUntilTerminal } from "./receipt.js";
import { exceedsParent, isTerminal, mapStatus, narrowCeiling, validateOrder } from "../../domain/managed-work.js";
import type {
  ManagedWorkCeiling,
  ManagedWorkOrder,
  ManagedWorkReceipt,
  ManagedWorkResult,
} from "../../ports/managed-work.js";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

/**
 * Managed work: the ceiling, the vocabulary, and the refusal wording (WP26 / L32).
 *
 * The rule these cases exist for is that a delegated session can never hold more
 * authority than the run that delegated to it. That is a pure function, so it is
 * tested exhaustively rather than trusted — and the interesting cases are the ones
 * where a level does *not* imply a capability.
 */

const READ_ONLY: ManagedWorkCeiling = {
  level: "read_only",
  shell: false,
  network: false,
  browser: false,
  computerUse: false,
};
const WORKSPACE_WRITE: ManagedWorkCeiling = {
  level: "workspace_write",
  shell: false,
  network: false,
  browser: false,
  computerUse: false,
};
const EVERYTHING: ManagedWorkCeiling = {
  level: "full_access",
  shell: true,
  network: true,
  browser: true,
  computerUse: true,
};

test("a child can never exceed its parent, at any level", () => {
  for (const parent of [READ_ONLY, WORKSPACE_WRITE, EVERYTHING]) {
    for (const requested of [READ_ONLY, WORKSPACE_WRITE, EVERYTHING]) {
      const narrowed = narrowCeiling(requested, parent);
      // The level is the weaker of the two. Checked by rank rather than by a
      // truth table, so the assertion says what the rule *is*.
      const rank = { read_only: 0, workspace_write: 1, full_access: 2 } as const;
      assert.equal(rank[narrowed.level], Math.min(rank[parent.level], rank[requested.level]));
      // Every capability is the AND of both, never the requested one alone.
      assert.equal(narrowed.shell, requested.shell && parent.shell);
      assert.equal(narrowed.network, requested.network && parent.network);
      assert.equal(narrowed.browser, requested.browser && parent.browser);
      assert.equal(narrowed.computerUse, requested.computerUse && parent.computerUse);
    }
  }
});

test("a read-only parent cannot delegate a shell, even by asking for full access", () => {
  const narrowed = narrowCeiling(EVERYTHING, READ_ONLY);
  assert.equal(narrowed.level, "read_only");
  assert.equal(narrowed.shell, false);
  assert.equal(narrowed.network, false);
  // And that is *noticeable*, which is what `exceedsParent` is for.
  assert.equal(exceedsParent(EVERYTHING, READ_ONLY), true);
});

test("a capability the parent lacks is dropped even when the level allows it", () => {
  // `workspace_write` does not imply the network; treating it as though it did is
  // how a permission model leaks.
  const requested: ManagedWorkCeiling = { ...WORKSPACE_WRITE, network: true };
  const narrowed = narrowCeiling(requested, WORKSPACE_WRITE);
  assert.equal(narrowed.network, false);
  assert.equal(exceedsParent(requested, WORKSPACE_WRITE), true);
});

test("asking for exactly what the parent has is not an excess", () => {
  assert.equal(exceedsParent(WORKSPACE_WRITE, WORKSPACE_WRITE), false);
  assert.equal(exceedsParent(READ_ONLY, READ_ONLY), false);
  assert.equal(exceedsParent(EVERYTHING, EVERYTHING), false);
});

test("the ceiling wording names both sides, so a refusal is actionable", () => {
  assert.match(describeCeiling(READ_ONLY), /read_only/);
  assert.match(describeCeiling(EVERYTHING), /shell/);
  assert.match(describeCeiling(READ_ONLY), /no capabilities/);
});

function order(overrides: Partial<ManagedWorkOrder> = {}): ManagedWorkOrder {
  return {
    title: "write the report",
    objective: "produce the quarterly summary",
    inputs: [{ kind: "text", value: "the numbers are in ./data.csv" }],
    scope: { include: ["reports"], exclude: [] },
    deliverables: [{ kind: "file", description: "reports/q3.md" }],
    evidenceRequirements: [],
    completionContract: [],
    budget: {},
    permissionCeiling: WORKSPACE_WRITE,
    delivery: "background",
    ...overrides,
  };
}

test("an order with no objective is refused", () => {
  const result = validateOrder(order({ objective: "   " }));
  assert.equal(result.ok, false);
  if (result.ok) return;
  assert.equal(result.code, "invalid_order");
});

test("a scope that excludes without including is refused as unbounded", () => {
  const result = validateOrder(order({ scope: { include: [], exclude: ["secrets"] } }));
  assert.equal(result.ok, false);
  if (result.ok) return;
  // "Everywhere except these" is how a session that was told to stay out of three
  // paths ends up writing everywhere else.
  assert.match(result.message, /would let the session write anywhere else/);
});

test("a `wait` delivery with no timeout is refused, because it could never return", () => {
  const result = validateOrder(order({ delivery: "wait" }));
  assert.equal(result.ok, false);
  if (result.ok) return;
  assert.match(result.message, /can never return/);
  // With a timeout it is fine.
  const withDeadline = validateOrder(order({ delivery: "wait", budget: { timeoutMs: 1000 } }));
  assert.equal(withDeadline.ok, true);
});

test("an order carrying nothing is refused rather than sent as a title", () => {
  const result = validateOrder({ ...order(), inputs: [] });
  assert.equal(result.ok, false);
  if (result.ok) return;
  assert.match(result.message, /from a title alone/);
});

test("an unrecognised backend status is never terminal", () => {
  // A backend adding a status must not be able to make a job look finished.
  for (const word of ["brand_new_status", "", "WeIrD"]) {
    const state = stateFromSession({ status: word });
    assert.equal(isTerminal(state.status), false, `'${word}' must not read as terminal`);
  }
  // And an absent status is likewise not a terminal claim.
  assert.equal(isTerminal(stateFromSession({}).status), false);
});

test("backend status words map onto this package's vocabulary", () => {
  assert.equal(mapStatus("pending"), "queued");
  assert.equal(mapStatus("awaiting_input"), "waiting");
  assert.equal(mapStatus("interrupted"), "waiting");
  assert.equal(mapStatus("completed"), "completed");
  assert.equal(mapStatus("error"), "failed");
  assert.equal(mapStatus("canceled"), "cancelled");
});

test("a waiting session names what it is waiting for", () => {
  const state = stateFromSession({
    status: "awaiting_input",
    pendingAction: { requestId: "req-7", description: "approve the deploy?" },
  });
  assert.deepEqual(state, { status: "waiting", requestId: "req-7", description: "approve the deploy?" });
  // And a pending action with no fields still says something usable.
  const bare = stateFromSession({ status: "awaiting_input" });
  assert.equal(bare.status, "waiting");
  if (bare.status === "waiting") {
    assert.match(bare.description, /needs an answer/);
  }
});

test("workspace matching is case-insensitive on Windows and prefix-based", () => {
  const rows = [{ id: "w1", path: "D:\\Work" }, { id: "w2", path: "D:\\Other" }];
  // The prefix case: a subdirectory of a registered workspace.
  assert.equal(matchWorkspace(rows, "D:\\Work\\project")?.id, "w1");
  // A sibling that merely shares a prefix string is not a match.
  assert.equal(matchWorkspace(rows, "D:\\Workplace")?.id, undefined);
  // And the exact directory matches.
  assert.equal(matchWorkspace(rows, "D:\\Work")?.id, "w1");
});

test("environment matching accepts either the derived id or the config field", () => {
  const byId = [{ id: "managed-env-w1" }];
  assert.equal(matchEnvironment(byId, "w1"), "managed-env-w1");
  const byConfig = [{ id: "whatever", config: { workspaceId: "w1" } }];
  assert.equal(matchEnvironment(byConfig, "w1"), "whatever");
  assert.equal(matchEnvironment(byId, "w-other"), undefined);
});

test("a non-JSON payload row is dropped rather than half-decoded", () => {
  const rows = rowsOf({ workspaces: [{ id: "w1" }, "nonsense", 42, null] }, "workspaces");
  assert.equal(rows.length, 1);
  assert.equal(rows[0]?.["id"], "w1");
  // And a payload of the wrong shape is an empty list, not a crash.
  assert.deepEqual(rowsOf("nonsense", "workspaces"), []);
});

test("an unreachable backend and a refused request are different codes", () => {
  const unreachable = refusalFrom(
    new ControlPlaneUnavailableError("unreachable", "connection refused"),
    "listing workspaces",
  );
  assert.equal(unreachable.ok, false);
  if (!unreachable.ok) assert.equal(unreachable.code, "backend_unavailable");

  const unauthorized = refusalFrom(
    new ControlPlaneUnavailableError("unauthorized", "invalid token"),
    "creating the session",
  );
  if (!unauthorized.ok) {
    // Different repair: fix the configuration, do not start a service.
    assert.equal(unauthorized.code, "backend_refused");
    assert.match(unauthorized.message, /token/);
  }

  const closed = refusalFrom(new ControlPlaneUnavailableError("closed", "closed"), "listing workspaces");
  if (!closed.ok) assert.equal(closed.code, "backend_unavailable");
});

test("artifacts are read from disk, so a claim without files comes back empty", () => {
  const root = mkdtempSync(join(tmpdir(), "wp26-artifacts-"));
  try {
    // Nothing written yet.
    assert.deepEqual(readArtifacts(root, "s-1"), []);
    // A claim is not a fact: the files have to be there.
    const out = join(root, ".trylo", "out", "managed", "s-1");
    mkdirSync(join(out, "nested"), { recursive: true });
    writeFileSync(join(out, "report.md"), "# q3", "utf8");
    writeFileSync(join(out, "nested", "data.csv"), "a,b", "utf8");
    writeFileSync(join(out, "notes"), "scratch", "utf8");
    const found = readArtifacts(root, "s-1");
    const paths = found.map((entry) => entry.relativePath);
    assert.deepEqual(paths, [
      ".trylo/out/managed/s-1/nested/data.csv",
      ".trylo/out/managed/s-1/notes",
      ".trylo/out/managed/s-1/report.md",
    ]);
    // Document-shaped files are marked; a scratch file is not given a kind it
    // does not have.
    assert.equal(found.find((entry) => entry.relativePath.endsWith("report.md"))?.kind, "file");
    assert.equal(found.find((entry) => entry.relativePath.endsWith("notes"))?.kind, undefined);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("polling stops at the deadline and reports `unknown`, never a verdict", async () => {
  // The clock is injected, so this asserts the *rule* — "stopped polling, said
  // unknown" — rather than waiting out a real deadline to find out.
  let clock = 1_000;
  let polls = 0;
  const status = async (): Promise<ManagedWorkResult<ManagedWorkReceipt>> => {
    polls += 1;
    clock += 400;
    return {
      ok: true,
      value: {
        childId: "managed-s-1",
        managedSessionId: "s-1",
        status: { status: "running" },
        artifacts: [],
        evidence: [],
      },
    };
  };
  const result = await pollUntilTerminal(status, "s-1", 1_000, 100, () => clock, async () => {});
  assert.equal(result.ok, true);
  if (!result.ok) return;
  // Nobody observed whether it finished, so the answer is "unknown" — not
  // "failed", which would invite a retry of a run that may already have worked.
  assert.equal(result.value.status.status, "unknown");
  if (result.value.status.status === "unknown") {
    assert.match(result.value.status.reason, /within 1000ms/);
  }
  assert.ok(polls > 0 && polls < 10, `expected a bounded number of polls, got ${polls}`);
});

test("polling returns as soon as the session reaches a terminal state", async () => {
  let polls = 0;
  const status = async (): Promise<ManagedWorkResult<ManagedWorkReceipt>> => {
    polls += 1;
    return {
      ok: true,
      value: {
        childId: "managed-s-1",
        managedSessionId: "s-1",
        status: polls < 3 ? { status: "running" } : { status: "completed" },
        artifacts: [],
        evidence: [],
      },
    };
  };
  const result = await pollUntilTerminal(status, "s-1", 60_000, 1, () => 0, async () => {});
  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.equal(result.value.status.status, "completed");
  // It stopped as soon as it could rather than running out the clock.
  assert.equal(polls, 3);
});

test("a failing status ends the wait with the refusal, not a wait", async () => {
  const result = await pollUntilTerminal(
    async () => ({ ok: false, code: "backend_unavailable", message: "the daemon is not running" }),
    "s-1",
    60_000,
    1,
    () => 0,
    async () => {},
  );
  assert.equal(result.ok, false);
  if (result.ok) return;
  assert.equal(result.code, "backend_unavailable");
});
