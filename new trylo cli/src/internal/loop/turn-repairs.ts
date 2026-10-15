import type { Engine } from "./runner-engine.js";
import type { LoopPorts, RunTurnRequest } from "./runner.js";
import type { CancelWatch } from "./cancel.js";
import { currentPhase, dispatch } from "./runner-effects.js";
import { nextId } from "./journal-emit.js";

/**
 * The two repairs a settled turn may still ask for — and they are inputs, not
 * afterthoughts: recording both keeps a replay faithful to the real turn.
 *
 * A retry is only worth it when nothing terminal was *decided*: a failed or
 * unknown end gets one more pass under a fresh abort, while every other
 * terminal reason (a refusal, a cancel) is the answer, not a flake. The
 * caller's verdict attaches to whatever terminal state the turn reached.
 */
export async function applyTurnRepairs(
  engine: Engine,
  ports: LoopPorts,
  request: RunTurnRequest,
  cancelled: CancelWatch,
  runIterations: (engine: Engine, ports: LoopPorts, cancelled: CancelWatch) => Promise<void>,
): Promise<void> {
  if (
    request.retryOnce === true &&
    currentPhase(engine) === "terminal" &&
    (engine.state.terminalReason === "failed" || engine.state.terminalReason === "unknown")
  ) {
    engine.abort = new AbortController();
    await dispatch(engine, ports, { type: "retry", eventId: nextId(engine) });
    await runIterations(engine, ports, cancelled);
  }
  if (request.verifyAfter !== undefined && currentPhase(engine) === "terminal") {
    await dispatch(engine, ports, {
      type: "check_result",
      eventId: nextId(engine),
      checkId: "check-1",
      verdict: request.verifyAfter,
    });
  }
}

