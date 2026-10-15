import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  DEFAULT_PROCESS_MAX_BUFFER_BYTES,
  MAX_PROCESS_BUFFER_BYTES,
  MAX_PROCESS_YIELD_MS,
  MIN_PROCESS_POLL_YIELD_MS,
  MIN_PROCESS_YIELD_MS,
  clampBufferBytes,
  isTerminalProcessStatus,
  readYieldMs,
  yieldMsWithinBounds,
} from "../../ports/process-session.js";

/**
 * The session vocabulary. These are the values the rest of the package is built
 * against, so each one is pinned to the fact it exists to protect: a bound that
 * moves silently changes how long a turn can hang, and a status that is renamed
 * changes what a caller is able to claim about a machine.
 */
describe("process session port vocabulary", () => {
  it("has exactly three terminal states and running is not one", () => {
    assert.equal(isTerminalProcessStatus("running"), false);
    assert.equal(isTerminalProcessStatus("exited"), true);
    assert.equal(isTerminalProcessStatus("failed"), true);
    assert.equal(isTerminalProcessStatus("lost"), true);
  });

  it("refuses a yield outside the agreed bounds rather than clamping it", () => {
    // Clamping would answer a question the caller did not ask: a model asking
    // for 10 minutes would be told it got 30 seconds, and would have no way to
    // tell that from having been refused.
    assert.equal(yieldMsWithinBounds(MIN_PROCESS_YIELD_MS), true);
    assert.equal(yieldMsWithinBounds(MAX_PROCESS_YIELD_MS), true);
    assert.equal(yieldMsWithinBounds(0), false);
    assert.equal(yieldMsWithinBounds(MIN_PROCESS_YIELD_MS - 1), false);
    assert.equal(yieldMsWithinBounds(MAX_PROCESS_YIELD_MS + 1), false);
  });

  it("keeps a poll long enough that answering instantly invites a spin loop", () => {
    // Codex holds empty writes to 5s; this build asks for 1s, which is the
    // point at which a poll that returns at once becomes a busy loop.
    assert.equal(MIN_PROCESS_POLL_YIELD_MS, 1_000);
    assert.ok(MIN_PROCESS_POLL_YIELD_MS > 0);
  });

  it("treats an absent yield as the caller's default and a wrong type as invalid", () => {
    assert.equal(readYieldMs(undefined, 500), 500);
    assert.equal(readYieldMs(null, 500), 500);
    assert.equal(readYieldMs(900, 500), 900);
    assert.equal(readYieldMs(900.7, 500), 900, "a fractional wait is a wait, rounded down");
    assert.equal(readYieldMs("900", 500), undefined, "a string is not a number");
    assert.equal(readYieldMs(Number.NaN, 500), undefined);
    assert.equal(readYieldMs(Number.POSITIVE_INFINITY, 500), undefined);
  });

  it("caps a buffer rather than accepting one large enough to exhaust memory", () => {
    assert.equal(clampBufferBytes(DEFAULT_PROCESS_MAX_BUFFER_BYTES), DEFAULT_PROCESS_MAX_BUFFER_BYTES);
    assert.equal(clampBufferBytes(10), 10);
    assert.equal(clampBufferBytes(0), 1, "zero bytes would discard every write");
    assert.equal(clampBufferBytes(-5), 1);
    assert.equal(clampBufferBytes(MAX_PROCESS_BUFFER_BYTES * 10), MAX_PROCESS_BUFFER_BYTES);
  });

  it("agrees with Codex on the bounds, so the two do not drift apart silently", () => {
    // Measured from codex-rs/core/src/unified_exec/mod.rs: MIN_YIELD_TIME_MS
    // 250, MAX_YIELD_TIME_MS 30_000, UNIFIED_EXEC_OUTPUT_MAX_BYTES 1 MiB.
    assert.equal(MIN_PROCESS_YIELD_MS, 250);
    assert.equal(MAX_PROCESS_YIELD_MS, 30_000);
    assert.equal(MAX_PROCESS_BUFFER_BYTES, 1_048_576);
  });
});
