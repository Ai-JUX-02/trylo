import assert from "node:assert/strict";
import { test } from "node:test";
import { SESSION_FORMAT_VERSION, type SessionRecord } from "../ports/session.js";
import type { TranscriptItem } from "../protocol/transcript.js";
import { createCompactionService } from "./service.js";
import {
  MICROCOMPACT_TOOL_RESULT_MAX_CHARS,
  elideOversizedToolResults,
} from "./microcompact.js";

/**
 * WP09.1 / L36 — tool-result microcompact.
 *
 * A full window is the wrong tool for one giant tool result: the whole point
 * of a tool's output is usually its head and tail, and replacing the *pair*
 * would orphan the tool call the model made. The read-time projection keeps
 * the pairing (same item, same `toolCallId`) and elides the payload of every
 * oversized tool result except the newest one — the outcome the model just
 * asked for stays verbatim.
 *
 * Written against the unfixed projection first (red evidence, WP09 交接记录):
 * an oversized tool result used to reach the model whole.
 */

const AT = "1970-01-01T00:00:00.000Z";

function userItem(sequence: number, text: string): TranscriptItem {
  return { kind: "user", sequence, text };
}

function toolResult(sequence: number, toolCallId: string, output: string): TranscriptItem {
  return {
    kind: "tool_result",
    sequence,
    toolCallId,
    name: "echo",
    output,
    truncated: false,
    outcome: "succeeded",
  };
}

function journalWith(items: ReadonlyArray<TranscriptItem>): ReadonlyArray<SessionRecord> {
  return [
    { formatVersion: SESSION_FORMAT_VERSION, sequence: 0, type: "session_start", sessionId: "s", at: AT, payload: {} },
    ...items.map((one, index) => ({
      formatVersion: SESSION_FORMAT_VERSION,
      sequence: index + 1,
      type: "transcript_item" as const,
      sessionId: "s",
      at: AT,
      payload: one as unknown as SessionRecord["payload"],
    })),
  ];
}

const OVERSIZED = "o".repeat(MICROCOMPACT_TOOL_RESULT_MAX_CHARS + 5_000);

test("an oversized tool result is elided in the projection, newest one excepted", () => {
  const items: TranscriptItem[] = [
    userItem(0, "run it"),
    toolResult(1, "call-old", OVERSIZED),
    userItem(2, "again"),
    toolResult(3, "call-new", OVERSIZED),
  ];
  const projected = createCompactionService().projectForPrompt({ records: journalWith(items) });
  assert.equal(projected.ok, true);
  if (!projected.ok) {
    return;
  }
  const results = projected.view.items.filter((one) => one.kind === "tool_result");
  const old = results[0];
  const fresh = results[1];
  assert.ok(old !== undefined && fresh !== undefined, "both tool results are projected");
  assert.ok(
    old.kind === "tool_result" && old.output.length < MICROCOMPACT_TOOL_RESULT_MAX_CHARS,
    "the old result is elided",
  );
  assert.ok(fresh.kind === "tool_result" && fresh.output === OVERSIZED, "the newest tool result stays verbatim");
  // The pairing survives: the stub is still the same tool result.
  if (old.kind === "tool_result") {
    assert.equal(old.toolCallId, "call-old");
  }
});

test("elision keeps head and tail and names the missing size", () => {
  const items: TranscriptItem[] = [
    userItem(0, "run it"),
    toolResult(1, "call-1", `HEAD-MARKER${"m".repeat(60_000)}TAIL-MARKER`),
    // The model consumed the earlier result and requested another tool.
    { kind: "tool_call", sequence: 2, toolCallId: "call-2", name: "echo", arguments: {} },
    toolResult(3, "call-2", "fresh"),
  ];
  const elided = elideOversizedToolResults(items)[1];
  assert.ok(elided !== undefined && elided.kind === "tool_result");
  if (elided.kind !== "tool_result") {
    return;
  }
  assert.equal(elided.output.includes("HEAD-MARKER"), true);
  assert.equal(elided.output.includes("TAIL-MARKER"), true);
  assert.match(elided.output, /elided \d+ chars/);
  assert.ok(elided.output.length < 5_000, `the stub is bounded, got ${elided.output.length}`);
  assert.equal(elided.truncated, true, "the stub is marked as truncated");
});

test("results within the cap and non-tool items pass through untouched", () => {
  const items: TranscriptItem[] = [
    userItem(0, "x".repeat(MICROCOMPACT_TOOL_RESULT_MAX_CHARS + 1)),
    toolResult(1, "call-1", "small"),
  ];
  const out = elideOversizedToolResults(items);
  assert.deepEqual(out, items);
});

test("every result of the newest parallel tool response survives until the model consumes it", () => {
  const items: TranscriptItem[] = [
    userItem(0, "Compare both files"),
    { kind: "tool_call", sequence: 1, toolCallId: "a", name: "echo", arguments: {} },
    { kind: "tool_call", sequence: 2, toolCallId: "b", name: "echo", arguments: {} },
    toolResult(3, "a", OVERSIZED), toolResult(4, "b", OVERSIZED),
  ];
  const fresh = elideOversizedToolResults(items);
  assert.deepEqual(fresh, items, "parallel siblings are all fresh, not only the last result");
  const consumed: TranscriptItem[] = [...items, { kind: "assistant_text", sequence: 5, blockId: "answer", text: "Both checked." }];
  assert.equal(elideOversizedToolResults(consumed).filter(i => i.kind === "tool_result" && i.output === OVERSIZED).length, 0,
    "a completed assistant response makes the whole batch eligible for elision");
});
