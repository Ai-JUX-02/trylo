// Trylo Desktop — P08 WP0: proof that the legacy translator CANNOT
// consume a trylo-v1 CLI trace.
//
// This is the "contract test goes red first" deliverable of P08 §WP0.
// It does not assert what we HOPE the app does — it pins what the app
// ACTUALLY does today with the frozen golden traces in
// `docs/fixtures/p08-cli-v1/` (captured 2026-09-22 from the real CLI,
// see `new trylo cli/docs/02-分期工程产出/P08-Desktop切换与Parity/evidence/2026-09-22-golden-trace/`).
//
// Why pin bad behaviour instead of just fixing it: §WP0's exit criterion is
// "测试能稳定证明未接入状态，而不是只检查函数调用". A test that merely
// asserts `adapter.project(x)` was called proves nothing. These assertions
// prove the four ways a v1 trace silently corrupts the UI today:
//
//   1. no terminal event at all → the composer stays busy forever;
//   2. `tool_use` / `tool_result` share a name with the legacy vocabulary,
//      so the fast path passes them through verbatim — the UI renders a
//      tool card whose `tool` / `input` / `ok` / `durationMs` are undefined
//      while looking structurally fine (spec §12 risk #1);
//   3. every `message_*` and `run_start` frame is dropped → no text;
//   4. `warning` frames are dropped → failures are invisible.
//
// These tests stay green after `TryloV1EventAdapter` lands, because the
// legacy translator must never learn the v1 vocabulary — the two paths are
// routed apart by `CliRuntimeProtocol`, not merged.

import { describe, expect, it } from 'vitest';
import { StreamTranslator } from './stream-translator';
import type { LoopEvent } from './loop-events';
import {
  TRACE_CANCELLED,
  TRACE_DENIED,
  TRACE_PRERUN_FAILURE,
  TRACE_SUCCESS,
  traceLines,
} from './trylo-v1-fixtures';

/** Feed a whole trace through the LEGACY translator, as `startTrylo` does. */
function feedLegacy(name: string): LoopEvent[] {
  const translator = new StreamTranslator();
  const out: LoopEvent[] = [];
  for (const line of traceLines(name)) {
    out.push(...translator.feed(line));
  }
  return out;
}

describe('WP0: legacy translator vs a trylo-v1 trace', () => {
  it('never produces a terminal event — the run would stay busy forever', () => {
    const events = feedLegacy(TRACE_SUCCESS);
    // `run_result` is not in the legacy vocabulary, so it is dropped and
    // nothing ever clears `busy`. This is the single worst failure mode:
    // a completed run that looks like a hung one.
    expect(events.some((e) => e.type === 'loop_end' || e.type === 'session_end')).toBe(false);
    expect(events.some((e) => e.type === 'turn_end')).toBe(false);
  });

  it('drops run_start, message_start, message_delta and message_end', () => {
    const events = feedLegacy(TRACE_SUCCESS);
    expect(events.some((e) => e.type === 'text')).toBe(false);
    // The whole assistant answer ("The package name is @trylo/cli.") is lost.
    expect(events.length).toBeGreaterThan(0); // the two tool frames survive — see below
    expect(events.every((e) => e.type === 'tool_use' || e.type === 'tool_result')).toBe(true);
  });

  it('passes v1 tool_use/tool_result through the fast path with missing fields', () => {
    const events = feedLegacy(TRACE_SUCCESS);
    const use = events.find((e) => e.type === 'tool_use');
    // It IS a tool_use event — that is exactly what makes this dangerous.
    expect(use).toBeDefined();
    const u = use as Record<string, unknown>;
    // The v1 frame carries `toolCallId` / `name`, never `id` / `tool` /
    // `input`. The UI reads the latter three, so the card renders blanks.
    expect(u['id']).toBeUndefined();
    expect(u['tool']).toBeUndefined();
    expect(u['input']).toBeUndefined();
    expect(u['turn']).toBeUndefined();
    // The v1 fields are present but meaningless to the reducer.
    expect(u['toolCallId']).toBe('fx-call-1');
    expect(u['name']).toBe('read_file');

    const result = events.find((e) => e.type === 'tool_result');
    const r = result as Record<string, unknown>;
    // v1 has `status: 'succeeded'`, not `ok`; no duration is carried.
    expect(r['ok']).toBeUndefined();
    expect(r['durationMs']).toBeUndefined();
    expect(r['turn']).toBeUndefined();
  });

  it('drops every warning — a denied write reaches the UI as silence', () => {
    const events = feedLegacy(TRACE_DENIED);
    // The trace carries warning(denied) + warning(observation) + a failed
    // run_result. The legacy path keeps only the malformed tool frames, so
    // the user sees a tool card and nothing explaining the refusal.
    expect(events.some((e) => e.type === 'tool_use')).toBe(true);
    expect(events.some((e) => e.type === 'loop_end')).toBe(false);
  });

  it('has nothing to translate at all for a pre-run failure', () => {
    // Exit code 52, stdout empty. A translator cannot help here — the
    // runner must synthesise a terminal outcome from stderr + exit code
    // (spec §5.1: pre-run failure needs a machine-readable terminal).
    expect(traceLines(TRACE_PRERUN_FAILURE)).toHaveLength(0);
    expect(traceLines(TRACE_CANCELLED)).toHaveLength(0);
  });
});
