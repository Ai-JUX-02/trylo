import assert from "node:assert/strict";
import { test } from "node:test";
import { createOpenAiCompatibleProvider } from "./openai-compatible.js";
import { httpFailureMessage } from "./http-failure-message.js";
import { runTurn } from "../../loop/runner.js";
import { createFakeCompaction, createFakePermission, createFakeTools, emptyProfileLoader } from "../../loop/fakes.js";

const endpoint = "https://ark.cn-beijing.volces.com/api/coding/v3/chat/completions", model = "glm-5.3-flash";
const diagnostics = { error: { code: "context_length_exceeded", message: "maximum context length exceeded PRIVATE-MARKER" } };
for (const repeated of [false, true]) test(`actual HTTP context rejection reaches one bounded loop recovery; repeated=${repeated}`, async () => {
  const bodies: Array<{ messages: Array<{ content: string }> }> = [];
  const provider = createOpenAiCompatibleProvider({ endpoint, model, apiKey: "fixture-key", fetchImpl: async (_url, init) => {
    bodies.push(JSON.parse(String(init?.body)));
    return bodies.length === 1 || repeated ? new Response(JSON.stringify(diagnostics), { status: 400 })
      : new Response('data: {"choices":[{"delta":{"content":"Recovered."},"finish_reason":"stop"}]}\n\ndata: [DONE]\n\n');
  } });
  const compact = createFakeCompaction({ estimatedPromptTokens: 100, estimatedAfterCompactionTokens: 100, summary: "SUMMARY-MARKER" });
  const result = await runTurn({ provider, profile: emptyProfileLoader(), tools: createFakeTools([]),
    permission: createFakePermission("approved"), compaction: compact.wiring,
  }, { sessionId: "s", turnId: "t", correlationId: "c", text: "Old input.", model, budget: { maxIterations: 6, contextTokenLimit: 8000 } });
  assert.equal(bodies.length, 2);
  assert.equal(result.compactions.length, 1);
  assert.equal(result.state.terminalReason, repeated ? "failed" : "completed");
  assert.ok(bodies[1]!.messages.some(item => item.content.includes("SUMMARY-MARKER")));
  assert.equal(JSON.stringify(result.envelopes).includes("PRIVATE-MARKER"), false);
});

test("HTTP diagnostics expose only fixed budget vocabulary, never provider prose", async () => {
  const signal = new AbortController().signal;
  for (const [body, status, category, expected] of [
    [JSON.stringify(diagnostics), 400, "invalid_request", "prompt is too long"],
    ['{"error":{"code":"context_length_exceeded"}}', 422, "invalid_request", "prompt is too long"],
    ['{"error":{"message":"image exceeds maximum PRIVATE-MARKER"}}', 400, "invalid_request", "media is too large"],
    ['{"error":{"message":"unknown PRIVATE-MARKER"}}', 400, "invalid_request", "http_400"],
    ["malformed PRIVATE-MARKER", 400, "invalid_request", "http_400"],
    [JSON.stringify(diagnostics), 401, "auth", "http_401"],
    [JSON.stringify({ ...diagnostics, padding: "x".repeat(8192) }), 400, "invalid_request", "http_400"],
  ] as const) assert.equal(await httpFailureMessage(new Response(body, { status }), category, signal), expected);
});

test("a stalled diagnostic body is cancelled by an injected deadline without masking the HTTP status", async () => {
  const deadline = new AbortController();
  let cancelled = false;
  const body = new ReadableStream<Uint8Array>({ cancel() { cancelled = true; } });
  const pending = httpFailureMessage(new Response(body, { status: 400 }), "invalid_request", new AbortController().signal,
    { timeoutSignal: deadline.signal });
  deadline.abort();
  assert.equal(await pending, "http_400");
  assert.equal(cancelled, true);
});

test("an unreadable diagnostic body preserves its classified failure", async () => {
  const body = new ReadableStream<Uint8Array>({ start(controller) { controller.error(new Error("PRIVATE-MARKER")); } });
  assert.equal(await httpFailureMessage(new Response(body, { status: 400 }), "invalid_request", new AbortController().signal), "http_400");
});
