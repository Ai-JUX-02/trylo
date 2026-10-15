import assert from "node:assert/strict";
import { test } from "node:test";
import type { CheckpointManifest, CheckpointPort, CheckpointResult } from "../ports/checkpoint.js";
import type { ProviderEvent, ProviderPort, ProviderRequest } from "../ports/provider.js";
import type { ToolBinding } from "../ports/tools.js";
import {
  createFakePermission,
  createFakeTools,
  echoBinding,
  emptyProfileLoader,
  toolResult,
} from "./fakes.js";
import { runTurn, type LoopPorts } from "./runner.js";

/**
 * Checkpoint wiring (WP E 波 §6.2).
 *
 * The port and the store have been shipping for a while with nobody calling
 * them, which means undo was a capability and not a fact. These cases are about
 * the calls: *when* a snapshot is taken, *how many* a turn takes, and what
 * happens when the store refuses.
 *
 * The rule under test is one sentence — before the first write, once — and each
 * case is a way a plausible wiring violates it: after the write, on every write,
 * on reads, or by turning a storage failure into a failed turn.
 */

const REQUEST = { sessionId: "s", turnId: "t", correlationId: "c", text: "write it" };

type Fake = {
  readonly port: CheckpointPort;
  readonly labels: string[];
  failWith?: string;
};

function fakeCheckpoint(): Fake {
  const fake: Fake = {
    labels: [],
    port: {
      async snapshot(input) {
        fake.labels.push(input.label);
        if (fake.failWith !== undefined) {
          return {
            ok: false,
            code: "storage_unavailable",
            detail: fake.failWith,
          } satisfies CheckpointResult<never>;
        }
        const manifest: CheckpointManifest = {
          formatVersion: "1",
          checkpointId: `cp-${fake.labels.length}`,
          label: input.label,
          createdAt: input.createdAt,
          fileCount: 2,
          totalBytes: 42,
          ignores: [],
          digest: "digest",
          files: [],
        };
        return { ok: true, value: { checkpointId: manifest.checkpointId, manifest } };
      },
      async restore() {
        return { ok: true, value: { restoredFiles: 1, removedFiles: 0 } };
      },
      async list() {
        return { ok: true, value: [] };
      },
    },
  };
  return fake;
}

function script(toolNames: readonly string[]): ReadonlyArray<ReadonlyArray<ProviderEvent>> {
  const streams: Array<ReadonlyArray<ProviderEvent>> = [];
  toolNames.forEach((name, index) => {
    streams.push([
      { type: "tool_call", toolCallId: `call-${index}`, name, arguments: { text: "hi" } },
      { type: "finish", reason: "tool_calls", rawReason: "tool_calls", requiresFollowUp: true },
    ]);
  });
  streams.push([{ type: "finish", reason: "stop", rawReason: "stop", requiresFollowUp: false }]);
  return streams;
}

function providerFor(toolNames: readonly string[]): { readonly requests: ProviderRequest[]; readonly port: ProviderPort } {
  const streams = script(toolNames);
  const requests: ProviderRequest[] = [];
  let index = 0;
  return {
    requests,
    port: {
      async *stream(request) {
        requests.push(request);
        const events = streams[index] ?? [];
        index += 1;
        for (const event of events) {
          yield event;
        }
      },
    },
  };
}

function bindings(toolNames: readonly string[]): ReadonlyArray<ToolBinding> {
  const write = echoBinding({ sideEffect: "workspace_write", needsApproval: false });
  const read = echoBinding({ sideEffect: "read_only", needsApproval: false });
  return toolNames.map((name) => ({ ...(name === "echo" ? write : read), name }));
}

function portsOf(
  provider: ProviderPort,
  tools: { readonly bindings: ReadonlyArray<ToolBinding> },
  checkpoint?: CheckpointPort,
): LoopPorts {
  return {
    profile: emptyProfileLoader(),
    permission: createFakePermission("approved"),
    tools: createFakeTools(
      tools.bindings.map(() => toolResult({ echo: "hi" }, "OUT")),
      tools.bindings,
    ),
    provider,
    ...(checkpoint === undefined
      ? {}
      : { checkpoint: { port: checkpoint, workspaceRoot: "/ws", now: () => "2026-01-01T00:00:00.000Z" } }),
  };
}

function checkpointEvents(result: Awaited<ReturnType<typeof runTurn>>) {
  return result.envelopes.filter(
    (envelope) =>
      envelope.kind === "observation" && envelope.payload["component"] === "checkpoint",
  );
}

test("a snapshot is taken once, before the first write of the turn", async () => {
  const provider = providerFor(["echo", "echo"]);
  const checkpoint = fakeCheckpoint();
  const tools = { bindings: bindings(["echo", "echo"]) };
  const result = await runTurn(portsOf(provider.port, tools, checkpoint.port), REQUEST);

  assert.equal(result.state.terminalReason, "completed");
  assert.deepEqual(checkpoint.labels, ["before:echo"]);
  const events = checkpointEvents(result);
  assert.equal(events.length, 1);
  assert.equal(events[0]?.payload["status"], "ok");
  assert.equal(events[0]?.payload["checkpointId"], "cp-1");

  // Before, not after: the snapshot is taken before the tool runs, so it
  // precedes the result that proves the tree changed. `tool_use` is emitted
  // when the call is *requested*, which is earlier than either.
  const snapshotAt = result.envelopes.findIndex(
    (envelope) => envelope.kind === "observation" && envelope.payload["component"] === "checkpoint",
  );
  const firstResultAt = result.envelopes.findIndex((envelope) => envelope.kind === "tool_result");
  assert.equal(firstResultAt >= 0, true);
  assert.equal(snapshotAt < firstResultAt, true);
});

test("a read-only turn takes no snapshot", async () => {
  const provider = providerFor(["read"]);
  const checkpoint = fakeCheckpoint();
  const tools = { bindings: bindings(["read"]) };
  const result = await runTurn(portsOf(provider.port, tools, checkpoint.port), REQUEST);
  assert.equal(result.state.terminalReason, "completed");
  assert.deepEqual(checkpoint.labels, []);
  assert.equal(checkpointEvents(result).length, 0);
});

test("a run with no checkpoint port behaves as it did before the port existed", async () => {
  const provider = providerFor(["echo"]);
  const tools = { bindings: bindings(["echo"]) };
  const result = await runTurn(portsOf(provider.port, tools), REQUEST);
  assert.equal(result.state.terminalReason, "completed");
  assert.equal(checkpointEvents(result).length, 0);
});

test("the second turn of a process still gets its snapshot", async () => {
  const checkpoint = fakeCheckpoint();
  const tools = { bindings: bindings(["echo"]) };
  const first = await runTurn(portsOf(providerFor(["echo"]).port, tools, checkpoint.port), REQUEST);
  const second = await runTurn(
    portsOf(providerFor(["echo"]).port, tools, checkpoint.port),
    { ...REQUEST, turnId: "t2" },
  );
  assert.equal(first.state.terminalReason, "completed");
  assert.equal(second.state.terminalReason, "completed");
  assert.deepEqual(checkpoint.labels, ["before:echo", "before:echo"]);
});

test("a store that cannot snapshot is reported and does not fail the write", async () => {
  const provider = providerFor(["echo"]);
  const checkpoint = fakeCheckpoint();
  checkpoint.failWith = "storage root is not reachable";
  const tools = { bindings: bindings(["echo"]) };
  const result = await runTurn(portsOf(provider.port, tools, checkpoint.port), REQUEST);

  assert.equal(result.state.terminalReason, "completed");
  const events = checkpointEvents(result);
  assert.equal(events.length, 1);
  assert.equal(events[0]?.payload["status"], "failed");
  assert.equal(events[0]?.payload["code"], "storage_unavailable");
  // The diagnosis names the code, never a path or a free-text detail.
  assert.equal(JSON.stringify(events[0]?.payload ?? {}).includes("not reachable"), false);
});
