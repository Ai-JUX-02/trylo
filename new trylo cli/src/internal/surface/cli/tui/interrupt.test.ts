import assert from "node:assert/strict";
import { test } from "node:test";
import {
  emptyInterruptState,
  reduceInterrupt,
  type InterruptInput,
} from "./interrupt.js";

/**
 * Contract #4's machine half: the first interrupt cancels the current thing
 * (input line, or the running turn), the process stays, and the second
 * consecutive interrupt exits. Any other key resets the count.
 */

function interrupt(phase: "idle" | "running"): InterruptInput {
  return { type: "interrupt", phase };
}

test("first interrupt at the prompt drops the input and keeps the process", () => {
  const next = reduceInterrupt(emptyInterruptState, interrupt("idle"));
  assert.equal(next.action.kind, "clear_input");
  assert.equal(next.state.consecutive, 1);
});

test("second consecutive interrupt at the prompt exits", () => {
  const first = reduceInterrupt(emptyInterruptState, interrupt("idle"));
  const second = reduceInterrupt(first.state, interrupt("idle"));
  assert.equal(second.action.kind, "exit");
});

test("any other key between interrupts resets the count", () => {
  const first = reduceInterrupt(emptyInterruptState, interrupt("idle"));
  const reset = reduceInterrupt(first.state, { type: "key" });
  assert.equal(reset.state.consecutive, 0);
  const later = reduceInterrupt(reset.state, interrupt("idle"));
  assert.equal(later.action.kind, "clear_input");
});

test("first interrupt during a turn requests the turn's cancellation", () => {
  const next = reduceInterrupt(emptyInterruptState, interrupt("running"));
  assert.equal(next.action.kind, "cancel_turn");
  assert.match(next.action.kind === "cancel_turn" ? next.action.note : "", /cancel/i);
});

test("second consecutive interrupt during a turn exits", () => {
  const first = reduceInterrupt(emptyInterruptState, interrupt("running"));
  const second = reduceInterrupt(first.state, interrupt("running"));
  assert.equal(second.action.kind, "exit");
});

test("the third interrupt is still an exit, never a crash", () => {
  let state = emptyInterruptState;
  for (let index = 0; index < 3; index += 1) {
    state = reduceInterrupt(state, interrupt("running")).state;
  }
  const fourth = reduceInterrupt(state, interrupt("running"));
  assert.equal(fourth.action.kind, "exit");
});
