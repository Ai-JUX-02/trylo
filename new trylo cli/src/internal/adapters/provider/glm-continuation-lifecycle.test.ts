import assert from "node:assert/strict";
import { test } from "node:test";
import { createGlmToolContinuation, type GlmToolContinuation } from "./glm-tool-continuation.js";
import { createOpenAiCompatibleProvider } from "./openai-compatible.js";
import type { ProviderMessage, ProviderRequest } from "../../ports/provider.js";
import { runTurn } from "../../loop/runner.js";
import { createFakeCompaction, createFakePermission, createFakeTools, echoBinding, emptyProfileLoader, toolResult } from "../../loop/fakes.js";
import { createModelSummarizer } from "../../surface/cli/compact-model-summarizer.js";

const endpoint = "https://ark.cn-beijing.volces.com/api/coding/v3/chat/completions", model = "glm-5.3-flash";
const call = { toolCallId: "reused-id", name: "echo", arguments: { value: 1 } };
const message: ProviderMessage = { role: "assistant", content: "Checking.", toolCalls: [call] };
const request: ProviderRequest = { attemptId: "a", continuationScope: JSON.stringify(["s", "t"]), model, messages: [], tools: [] };
function finish(capture: GlmToolContinuation | undefined, reasoning: string) {
  assert.ok(capture);
  capture.observe({ type: "reasoning_delta", blockId: "r", text: reasoning, redacted: false });
  capture.observe({ type: "text_delta", blockId: "b", text: "Checking." });
  capture.observe({ type: "tool_call", ...call });
  capture.observe({ type: "finish", reason: "tool_calls", rawReason: "tool_calls", requiresFollowUp: true });
  capture.commit();
}

test("reused tool ids preserve distinct native reasoning in complete ordered history", () => {
  const c = createGlmToolContinuation(endpoint, model), first = { ...message }, second = { ...message };
  finish(c.begin(request), "FIRST"); finish(c.begin(request), "SECOND");
  const next = c.begin({ ...request, messages: [first, second] })!;
  assert.deepEqual([next.fieldsFor(first).reasoning_content, next.fieldsFor(second).reasoning_content], ["FIRST", "SECOND"]);
});

test("an ambiguous compacted or evicted repeated identity never receives a different response's reasoning", () => {
  const c = createGlmToolContinuation(endpoint, model);
  finish(c.begin(request), "FIRST"); finish(c.begin(request), "SECOND");
  assert.equal(c.begin({ ...request, messages: [message] })!.fieldsFor(message).reasoning_content, undefined);
});

test("a late overlapping request in the same scope cannot replace the newer checkpoint", () => {
  const c = createGlmToolContinuation(endpoint, model), older = c.begin(request), newer = c.begin({ ...request, attemptId: "b" });
  finish(newer, "NEWER"); finish(older, "OLDER");
  const assistant = c.persistence!.capture(request.continuationScope!)!["assistant"];
  assert.deepEqual(assistant, { reasoning: "NEWER", text: "Checking.", calls: [call] });
});

test("an unscoped auxiliary request cannot read, retain or erase the paused parent's native state", () => {
  const c = createGlmToolContinuation(endpoint, model);
  finish(c.begin(request), "PARENT");
  const { continuationScope: _scope, ...auxiliary } = request;
  assert.equal(c.begin({ ...auxiliary, messages: [message] }), undefined);
  assert.equal(c.persistence!.capture(request.continuationScope!), undefined);
  assert.equal(c.begin({ ...request, messages: [message] })!.fieldsFor(message).reasoning_content, "PARENT");
});

test("native overhead uses exactly the fields which will be replayed", () => {
  const c = createGlmToolContinuation(endpoint, model);
  finish(c.begin(request), "123456789");
  assert.equal(c.persistence!.estimateOverheadTokens!([message]), 3);
  assert.equal(c.persistence!.estimateOverheadTokens!([{ ...message, content: "Changed." }]), 0);
  assert.equal(c.persistence!.estimateOverheadTokens!([message, { ...message }]), 0);
});

test("native cache eviction keeps the 32-response bound without partially replaying duplicate groups", () => {
  const c = createGlmToolContinuation(endpoint, model);
  for (let i = 0; i < 33; i++) finish(c.begin(request), "R" + i);
  const full = Array.from({ length: 33 }, () => ({ ...message }));
  assert.equal(c.persistence!.estimateOverheadTokens!(full), 0);
  const tail = full.slice(1), next = c.begin({ ...request, messages: tail })!;
  assert.deepEqual(tail.map(item => next.fieldsFor(item).reasoning_content), Array.from({ length: 32 }, (_, i) => "R" + (i + 1)));
});

test("production model-summary compaction preserves the parent tool continuation", async () => {
  const bodies: Array<{ messages: Array<{ role: string; reasoning_content?: string }> }> = [];
  const provider = createOpenAiCompatibleProvider({ endpoint, model, apiKey: "fixture-key", fetchImpl: async (_url, init) => {
    bodies.push(JSON.parse(String(init?.body)));
    const frames = bodies.length === 1 ? [
      { choices: [{ delta: { reasoning_content: "PARENT", content: "Checking.", tool_calls: [{ index: 0, id: call.toolCallId,
        function: { name: call.name, arguments: JSON.stringify(call.arguments) } }] }, finish_reason: null }] },
      { choices: [{ delta: {}, finish_reason: "tool_calls" }] },
    ] : [{ choices: [{ delta: { content: bodies.length === 2 ? "Safe summary." : "Done." }, finish_reason: "stop" }] }];
    return new Response(frames.map(frame => `data: ${JSON.stringify(frame)}\n\n`).join("") + "data: [DONE]\n\n");
  } });
  const compact = createFakeCompaction({ estimatedPromptTokens: 9000, estimatedAfterCompactionTokens: 100 });
  const result = await runTurn({ provider, profile: emptyProfileLoader(), permission: createFakePermission("approved"),
    tools: createFakeTools([toolResult({ value: 1 })], [echoBinding({ needsApproval: false })]),
    compaction: { ...compact.wiring, summarize: createModelSummarizer({ provider, model }) },
  }, { sessionId: "s", turnId: "t", correlationId: "c", text: "Use echo.", model, budget: { maxIterations: 4, contextTokenLimit: 8000 } });
  assert.equal(result.state.terminalReason, "completed");
  assert.equal(result.compactions.length, 1);
  assert.equal(bodies.length, 3);
  assert.equal(bodies[1]!.messages.some(item => item.reasoning_content !== undefined), false);
  assert.equal(bodies[2]!.messages.find(item => item.role === "assistant")?.reasoning_content, "PARENT");
});
