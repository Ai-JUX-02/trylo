import assert from "node:assert/strict";
import { test } from "node:test";
import { runTurn } from "./runner.js";
import { createFakeCompaction, createFakePermission, emptyProfileLoader, echoBinding, toolResult } from "./fakes.js";
import type { ProviderRequest, ProviderEvent } from "../ports/provider.js";
import type { ToolPort } from "../ports/tools.js";
import { finalReportInstructions } from "./budget-final-report.js";

const request = { sessionId: "s", turnId: "t", correlationId: "c", text: "Do the work and report actual validation." };

test("final report action facts exclude prior turns, preserve failures and omit tool payloads", () => {
  const prompt = finalReportInstructions([
    { kind: "user", sequence: 1, text: "prior" },
    { kind: "tool_result", sequence: 2, toolCallId: "old", name: "old_writer", outcome: "succeeded", output: "private-old", truncated: false },
    { kind: "user", sequence: 3, text: "current" },
    { kind: "tool_result", sequence: 4, toolCallId: "find", name: "find_files", outcome: "succeeded", output: "private-name", truncated: false },
    { kind: "tool_result", sequence: 5, toolCallId: "write", name: "write_file", outcome: "failed", output: "private-error", truncated: false },
  ]);
  assert.match(prompt, /find_files: succeeded/);
  assert.match(prompt, /write_file: failed/);
  assert.doesNotMatch(prompt, /old_writer|private-/);
  assert.match(prompt, /not proof of delivery/);
});

async function scenario(final: "report" | "rogue", reserve: boolean) {
  const requests: ProviderRequest[] = [];
  let executions = 0;
  const tools: ToolPort = {
    snapshot: () => [echoBinding({ needsApproval: false })],
    async execute() { executions += 1; return toolResult({ observed: true }); },
    async cancel() { return; },
  };
  const result = await runTurn({
    tools, permission: createFakePermission("approved"), profile: emptyProfileLoader(),
    provider: { async *stream(input): AsyncIterable<ProviderEvent> {
      requests.push(input);
      if (requests.length === 1 || final === "rogue") {
        yield { type: "tool_call", toolCallId: `call-${requests.length}`, name: "echo", arguments: {} };
        yield { type: "finish", reason: "tool_calls", rawReason: "tool_calls", requiresFollowUp: true };
      } else {
        yield { type: "text_start", blockId: "final" };
        yield { type: "text_delta", blockId: "final", text: "Observed one tool result; validation is still unverified." };
        yield { type: "text_end", blockId: "final" };
        yield { type: "finish", reason: "stop", rawReason: "stop", requiresFollowUp: false };
      }
    } },
  }, { ...request, budget: { maxIterations: 2, ...(reserve ? { finalRequest: "report_only" as const } : {}) } });
  return { result, requests, executions };
}

test("a reserved final request reports within the same budget with no tools and no quality promotion", async () => {
  const { result, requests, executions } = await scenario("report", true);
  assert.equal(requests.length, 2);
  assert.equal(requests[0]!.tools.length, 1);
  assert.deepEqual(requests[1]!.tools, []);
  assert.equal(requests[1]!.messages.at(-1)!.role, "user");
  assert.match(requests[1]!.messages.at(-1)!.content, /Final request at this turn/);
  assert.ok(requests[1]!.messages.some(message => /No tools are available for this request/.test(message.content)));
  assert.equal(executions, 1);
  assert.equal(result.state.terminalReason, "completed");
  assert.equal(result.state.verification.status, "unset");
});

test("a provider that calls a registered tool in the reserved report request cannot execute it", async () => {
  const { result, requests, executions } = await scenario("rogue", true);
  assert.equal(requests.length, 2, "the report must not add a third request outside the ceiling");
  assert.equal(executions, 1, "a report-only catalog must narrow actual execution as well as the wire");
  assert.equal(result.state.terminalReason, "failed");
});

test("without a reserved final request the library retains its full tool catalog", async () => {
  const { requests, executions } = await scenario("rogue", false);
  assert.equal(requests.length, 2);
  assert.equal(executions, 2);
  assert.equal(requests[1]!.tools.length, 1);
});

test("a rejected reserved report cannot retry outside the provider-request ceiling", async () => {
  let requests = 0;
  const result = await runTurn({
    tools: { snapshot: () => [], execute: async () => toolResult({}), cancel: async () => undefined },
    permission: createFakePermission("approved"), profile: emptyProfileLoader(),
    compaction: createFakeCompaction({ summary: "The artifact is still unverified." }).wiring,
    provider: { async *stream(): AsyncIterable<ProviderEvent> {
      requests += 1;
      if (requests === 2) {
        yield { type: "error", class: "invalid_request", retryable: false, phase: "before_headers", message: "This model's maximum context length is 8000 tokens; however, your prompt has 9000" };
      } else {
        yield { type: "finish", reason: "stop", rawReason: "stop", requiresFollowUp: requests < 2 };
      }
    } },
  }, { ...request, budget: { maxIterations: 2, contextTokenLimit: 8000, ...{ finalRequest: "report_only" as const } } });
  assert.equal(requests, 2);
  assert.equal(result.state.terminalReason, "failed");
});
