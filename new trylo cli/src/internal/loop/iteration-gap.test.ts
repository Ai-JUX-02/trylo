import assert from "node:assert/strict";
import { test } from "node:test";
import type { BudgetVerdict } from "../domain/iteration.js";
import { decideGap, waitingReasonFor } from "./iteration-gap.js";

/**
 * The gap decision (WP D 波 §5.3 / §5.4).
 *
 * Kept next to its subject because the table *is* the behaviour: three of the
 * four outcomes look identical to a caller that only reads `kind`, and the whole
 * point of the wave is that a context ceiling and an iteration ceiling are not
 * the same event.
 */

const within: BudgetVerdict = { kind: "within_budget" };
const outOfIterations: BudgetVerdict = { kind: "iterations_exhausted", used: 8, limit: 8 };
const outOfTokens: BudgetVerdict = { kind: "output_tokens_exhausted", used: 4096, limit: 4096 };
const outOfContext: BudgetVerdict = { kind: "context_limit", used: 200000, limit: 200000 };

test("a turn inside its budget continues without a decision", () => {
  assert.deepEqual(decideGap(within, false), { kind: "within_budget" });
  assert.deepEqual(decideGap(within, true), { kind: "within_budget" });
});

test("a context ceiling compacts and continues while compaction may help", () => {
  assert.deepEqual(decideGap(outOfContext, true), { kind: "compact_then_continue" });
});

test("a context ceiling that compaction cannot help awaits a person", () => {
  assert.deepEqual(decideGap(outOfContext, false), {
    kind: "await_continuation",
    reason: "context_limit",
  });
});

test("iteration and output-token ceilings await a person, never a retry", () => {
  assert.deepEqual(decideGap(outOfIterations, true), {
    kind: "await_continuation",
    reason: "iterations_exhausted",
  });
  assert.deepEqual(decideGap(outOfTokens, true), {
    kind: "await_continuation",
    reason: "output_tokens_exhausted",
  });
});

test("the waiting reason is the only string a projection has to match", () => {
  assert.equal(waitingReasonFor("iterations_exhausted"), "waiting:iterations_exhausted");
  assert.equal(waitingReasonFor("output_tokens_exhausted"), "waiting:output_tokens_exhausted");
  assert.equal(waitingReasonFor("context_limit"), "waiting:context_limit");
});
