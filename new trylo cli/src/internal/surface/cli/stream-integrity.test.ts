import assert from "node:assert/strict";
import { test } from "node:test";
import type { Envelope, JsonObject } from "../../protocol/envelope.js";
import { createTurnRenderer } from "./render.js";
import { createStreamTranslator, projectEnvelopeSequence } from "./stream-projection.js";

function envelope(kind: string, payload: JsonObject, milliseconds = 0): Envelope {
  return { protocolVersion: "0.0", eventId: `e${milliseconds}`, sequence: milliseconds,
    producerId: "contract", producerSequence: milliseconds,
    timestamp: new Date(milliseconds).toISOString(), kind, payload };
}

test("a renderer emits exactly one result and seals late envelopes after close", () => {
  const lines: string[] = [];
  const start = { sessionId: "s", turnId: "t", providerId: "fixture", model: "fixture" };
  const renderer = createTurnRenderer("stream-json", { stdout: line => lines.push(line), stderr() {} }, start);
  renderer.onEnvelope(envelope("text", { text: "done" }));
  const usage = { inputTokens: 1, outputTokens: 1, totalTokens: 2 };
  const meta = { ...start, iterations: 1, durationMs: 100 };
  const first = renderer.close([], usage, meta, { status: "completed", finishReason: "stop" });
  renderer.onEnvelope(envelope("text", { text: "late" }));
  assert.strictEqual(renderer.close([], usage, meta, { status: "failed", finishReason: "late" }), first);
  const frames = lines.map(line => JSON.parse(line) as { type: string; text?: string });
  assert.equal(frames.filter(frame => frame.type === "run_result").length, 1);
  assert.equal(frames.at(-1)?.type, "run_result");
  assert.equal(frames.some(frame => frame.text === "late"), false);
});

test("finished translators cannot reopen message blocks", () => {
  const translator = createStreamTranslator();
  translator.push(envelope("text", { text: "before" }));
  assert.deepEqual(translator.finish(), [{ type: "message_end" }]);
  assert.deepEqual(translator.push(envelope("text", { text: "late" })), []);
  assert.deepEqual(translator.finish(), []);
});

test("terminal evidence closes blocks before diagnostics and seals subsequent envelopes", () => {
  const translator = createStreamTranslator();
  translator.push(envelope("text", { text: "partial" }));
  const end = translator.push(envelope("terminal", { reason: "failed", errorClass: "network" }));
  assert.deepEqual(end.map(event => event.type), ["message_end", "warning"]);
  assert.deepEqual(translator.push(envelope("text", { text: "late" })), []);
});

test("redacted reasoning preserves its lifecycle without emitting private bytes", () => {
  const events = projectEnvelopeSequence([
    envelope("thinking", { redacted: true, text: "PRIVATE-REASONING" }),
    envelope("text", { text: "public answer" }),
  ]);
  assert.equal(JSON.stringify(events).includes("PRIVATE-REASONING"), false);
  assert.deepEqual(events.map(event => event.type), [
    "reasoning_start", "reasoning_end", "message_start", "message_delta", "message_end",
  ]);
});

test("tool results carry recorded name, failure code and elapsed envelope time", () => {
  const events = projectEnvelopeSequence([
    envelope("tool_use", { toolCallId: "call", name: "read_file", arguments: { path: "missing" } }, 100),
    envelope("tool_result", { toolCallId: "call", status: "failed", code: "ENOENT", message: "missing" }, 350),
  ]);
  assert.deepEqual(events.at(-1), { type: "tool_result", toolCallId: "call", name: "read_file",
    status: "failed", code: "ENOENT", output: "", message: "ENOENT:missing", truncated: false, durationMs: 250 });
});
