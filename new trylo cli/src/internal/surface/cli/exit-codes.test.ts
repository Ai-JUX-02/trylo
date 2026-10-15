import assert from "node:assert/strict";
import { test } from "node:test";
import {
  EXIT_CODES,
  isExitCode,
  exitCodeForRunStatus,
} from "../../protocol/cli-stream.js";
import { EXIT_CODE_TABLE } from "./usage.js";

/**
 * The exit code table is the contract (WP C 波 §4.2, 反方 #16).
 *
 * `EXIT_CODES` is the set of values; `EXIT_CODE_TABLE` is the promise about
 * them. These tests are what stops the two from drifting: add a code to the
 * protocol without documenting it, or document one the protocol does not know,
 * and the build goes red instead of quietly widening what a parent process has
 * to handle.
 */

test("the table covers every exit code exactly once", () => {
  const documented = EXIT_CODE_TABLE.map((row) => row.code).sort((a, b) => a - b);
  const declared = [...new Set(Object.values(EXIT_CODES))].sort((a, b) => a - b);
  assert.deepEqual(documented, declared);
  assert.equal(new Set(documented).size, documented.length, "no duplicate rows");
});

test("every row names the protocol constant it documents", () => {
  const byCode = new Map(Object.entries(EXIT_CODES).map(([name, code]) => [code, name]));
  for (const row of EXIT_CODE_TABLE) {
    assert.equal(byCode.get(row.code), row.name, `row ${row.code} is named ${row.name}`);
    assert.equal(isExitCode(row.code), true, `${row.code} is not an ExitCode`);
    assert.equal(row.when.length > 0, true, `${row.name} needs a consequence`);
  }
});

test("the retryable and cancelled codes say so", () => {
  const temporary = EXIT_CODE_TABLE.find((row) => row.code === EXIT_CODES.TEMPORARY);
  assert.equal(temporary?.code, 75);
  assert.match(temporary?.when ?? "", /retry/);
  const cancelled = EXIT_CODE_TABLE.find((row) => row.code === EXIT_CODES.CANCELLED);
  assert.equal(cancelled?.code, 130);
  assert.match(cancelled?.when ?? "", /cancelled/);
});

test("a cancelled run leaves through the cancelled code, a completed one through 0", () => {
  // The live 0/2/41/52 cases are asserted against the real binary in
  // `cmd/trylo/main.test.ts`; 130 is asserted here because the CLI has no
  // key to press — cancelling is a loop outcome, not a command-line one.
  assert.equal(exitCodeForRunStatus("cancelled"), EXIT_CODES.CANCELLED);
  assert.equal(exitCodeForRunStatus("completed"), EXIT_CODES.OK);
  assert.equal(exitCodeForRunStatus("failed"), EXIT_CODES.EXECUTION_FAILURE);
  assert.equal(exitCodeForRunStatus("unknown"), EXIT_CODES.EXECUTION_FAILURE);
});
