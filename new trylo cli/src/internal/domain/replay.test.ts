import assert from "node:assert/strict";
import { test } from "node:test";
import type { ReduceInput } from "./input.js";
import { replay, sameState } from "./replay.js";

const inputs: readonly ReduceInput[] = [
  {
    type: "start_turn",
    eventId: "e1",
    sessionId: "ses-1",
    turnId: "trn-1",
    correlationId: "cor-1",
    text: "hi",
  },
  { type: "begin_stream", eventId: "e2" },
  { type: "text_delta", eventId: "e3", text: "hello" },
  { type: "finish", eventId: "e4" },
  { type: "turn_complete", eventId: "e5" },
];

test("replaying the same journal yields the same state", () => {
  const first = replay(inputs);
  const second = replay(inputs);
  assert.equal(first.failedAt, undefined);
  assert.equal(sameState(first.state, second.state), true);
  assert.equal(first.state.phase, "terminal");
  assert.equal(first.state.terminalReason, "completed");
});

test("dropping an event changes the state", () => {
  const full = replay(inputs);
  const dropped = replay(inputs.slice(0, 3));
  assert.equal(sameState(full.state, dropped.state), false);
  assert.equal(dropped.state.phase, "streaming");
});
