// Trylo Desktop — TryloV1EventAdapter contract tests (P08 §5 / WP2).
//
// Every assertion runs against the FROZEN golden traces captured from
// the real CLI (`docs/fixtures/p08-cli-v1/`), never against hand-written
// stand-ins. That is the point of WP0: the adapter is judged on bytes
// the CLI actually emitted, including the awkward ones
// (`message: ""`, a missing tool name, an empty stdout on failure).

import { describe, expect, it } from 'vitest';
import { TryloV1EventAdapter } from './trylo-v1-event-adapter';
import { parseCliV1Event } from './trylo-v1-protocol';
import type {
  LoopEndEvent,
  LoopEvent,
  RuntimeWarningEvent,
  TextEvent,
  ThinkingEvent,
  ToolResultEvent,
  ToolUseEvent,
  TurnEndEvent,
} from './loop-events';
import {
  TRACE_CANCELLED,
  TRACE_DENIED,
  TRACE_PRERUN_FAILURE,
  TRACE_SUCCESS,
  TRACE_WRITE_TOOL,
  traceExitCode,
  traceLines,
  traceStderr,
} from './trylo-v1-fixtures';

function feed(adapter: TryloV1EventAdapter, lines: readonly string[]): LoopEvent[] {
  const out: LoopEvent[] = [];
  for (const line of lines) out.push(...adapter.feed(line));
  return out;
}

function project(trace: string): { events: LoopEvent[]; adapter: TryloV1EventAdapter } {
  const adapter = new TryloV1EventAdapter();
  const events = feed(adapter, traceLines(trace));
  return { events, adapter };
}

function only<T extends LoopEvent['type']>(
  events: readonly LoopEvent[],
  type: T,
): Extract<LoopEvent, { type: T }>[] {
  return events.filter((e) => e.type === type) as Extract<LoopEvent, { type: T }>[];
}

describe('TryloV1EventAdapter — golden trace projection', () => {
  it('ignores replayed tool frames without reopening terminal cleanup', () => {
    const lines = traceLines(TRACE_SUCCESS);
    const kind = (line: string) => (JSON.parse(line) as { type: string }).type;
    const adapter = new TryloV1EventAdapter();
    feed(adapter, lines.filter(line => ['run_start', 'tool_use', 'tool_result'].includes(kind(line))));
    const toolFrames = lines.filter(line => ['tool_use', 'tool_result'].includes(kind(line)));
    expect(feed(adapter, toolFrames)).toEqual([]);
    const terminal = adapter.feed(lines.find(line => kind(line) === 'run_result')!);
    expect(only(terminal, 'tool_result')).toHaveLength(0);
    expect(only(terminal, 'loop_end')).toHaveLength(1);
  });
  it('projects 01-success into a complete, terminal run', () => {
    const { events, adapter } = project(TRACE_SUCCESS);

    // run_start → loop_start + turn_start
    const starts = only(events, 'loop_start');
    expect(starts).toHaveLength(1);
    expect(starts[0]!.sessionId).toMatch(/^eph-/);
    expect(starts[0]!.model).toBe('default');
    // The v1 stream declares no tool list; it must not be fabricated.
    expect(starts[0]!.tools).toEqual([]);
    expect(only(events, 'turn_start')).toHaveLength(1);

    // The real answer survives, partial frames included.
    const texts = only(events, 'text');
    expect(texts.length).toBeGreaterThan(1);
    expect(texts.some((t) => t.partial === true)).toBe(true);
    const final = texts[texts.length - 1]!;
    expect(final.partial).toBeUndefined();
    expect(final.fullText).toBe('The package name is @trylo/cli.');

    // Exactly one terminal pair, and it is NOT an error.
    expect(only(events, 'turn_end')).toHaveLength(1);
    const ends = only(events, 'loop_end');
    expect(ends).toHaveLength(1);
    expect(ends[0]!.isError).toBe(false);
    expect(ends[0]!.finalResult).toBe('The package name is @trylo/cli.');
    expect(adapter.hasTerminal).toBe(true);
    expect(adapter.summary().outcome).toBe('completed');
  });

  it('maps tool frames onto Desktop tool events with real fields', () => {
    const { events } = project(TRACE_SUCCESS);
    const use = only(events, 'tool_use') as ToolUseEvent[];
    expect(use).toHaveLength(1);
    // These three are exactly what the legacy fast path left undefined.
    expect(use[0]!.id).toBe('fx-call-1');
    expect(use[0]!.tool).toBe('Read');
    expect(use[0]!.input).toEqual({});

    const result = only(events, 'tool_result') as ToolResultEvent[];
    expect(result).toHaveLength(1);
    expect(result[0]!.id).toBe('fx-call-1');
    expect(result[0]!.ok).toBe(true);
    expect(result[0]!.durationMs).toBeGreaterThanOrEqual(0);
    // The v1 frame names no tool — empty, never guessed.
    expect(result[0]!.tool).toBe('Read');
  });

  it('does not emit an event per usage frame', () => {
    const { events } = project(TRACE_SUCCESS);
    // The trace carries three usage frames and exactly one turn boundary.
    expect(traceLines(TRACE_SUCCESS).filter((l) => l.includes('"usage"')).length).toBe(3);
    expect(only(events, 'turn_end')).toHaveLength(1);
  });

  it('carries the final usage onto turn_end', () => {
    const { events } = project(TRACE_SUCCESS);
    const turnEnd = only(events, 'turn_end') as TurnEndEvent[];
    expect(turnEnd[0]!.usage).toEqual({ input_tokens: 48, output_tokens: 20 });
  });
});

describe('TryloV1EventAdapter — warnings are visible, not dropped', () => {
  it('shows a pre-run stderr failure once in the chat instead of a silent terminal', () => {
    const adapter = new TryloV1EventAdapter();
    const events = adapter.finalizeExit({ exitCode: 52,
      stderr: ['cannot resume session desktop-stopped: lock_conflict'], cancelled: false });
    expect(only(events, 'runtime_warning')).toHaveLength(1);
    expect(only(events, 'runtime_warning')[0]!.message).toContain('lock_conflict');
    expect(adapter.finalizeExit({ exitCode: 52, stderr: [], cancelled: false })).toEqual([]);
  });
  it('surfaces the checkpoint warning from the write-tool trace', () => {
    const { events } = project(TRACE_WRITE_TOOL);
    const warnings = only(events, 'runtime_warning') as RuntimeWarningEvent[];
    expect(warnings.length).toBeGreaterThanOrEqual(1);
    expect(warnings.map((w) => w.code)).toContain('checkpoint');
  });

  it('keeps a warning whose message is empty', () => {
    // The captured frames are literally {"code":"checkpoint","message":""}.
    // Dropping "empty" warnings would hide the only signal a denied write
    // ever produces.
    const warnings = only(project(TRACE_DENIED).events, 'runtime_warning') as RuntimeWarningEvent[];
    expect(warnings.map((w) => w.code)).toEqual(['denied', 'observation']);
    expect(warnings.every((w) => typeof w.message === 'string')).toBe(true);
    // A warning is never dressed up as something the model said.
    expect(project(TRACE_DENIED).events.some((e) => e.type === 'text')).toBe(false);
  });

  it('reports a denied tool run as an error terminal', () => {
    const { events } = project(TRACE_DENIED);
    const end = only(events, 'loop_end') as LoopEndEvent[];
    expect(end).toHaveLength(1);
    expect(end[0]!.isError).toBe(true);
  });

  it('settles the pending card when denial ends the run without a tool result', () => {
    const { events } = project(TRACE_DENIED);
    const calls = only(events, 'tool_use');
    expect(calls).toHaveLength(1);
    const results = only(events, 'tool_result');
    expect(results).toHaveLength(1);
    expect(results[0]).toMatchObject({ id: calls[0]!.id, ok: false, output: '' });
    expect(results[0]!.error).toContain('failed');
    expect(events.indexOf(results[0]!)).toBeLessThan(events.indexOf(only(events, 'loop_end')[0]!));
  });

  it('settles a pending card on stop without reporting successful execution', () => {
    const adapter = new TryloV1EventAdapter();
    adapter.feed('{"type":"tool_use","toolCallId":"pending","name":"write_file","input":{"path":"proof.txt"}}');
    const events = adapter.finalizeExit({ exitCode: 130, stderr: [], cancelled: true });
    expect(only(events, 'tool_result')[0]).toMatchObject({ id: 'pending', tool: 'Write', ok: false, output: '' });
    expect(only(events, 'tool_result')[0]!.error).toContain('cancelled');
    expect(adapter.finalizeExit({ exitCode: 130, stderr: [], cancelled: true })).toEqual([]);
  });
});

describe('TryloV1EventAdapter — terminal truth', () => {
  it('ignores a second run_result', () => {
    const adapter = new TryloV1EventAdapter();
    const terminal =
      '{"type":"run_result","status":"completed","finishReason":"stop","sessionId":"s1","turnId":"t1","iterations":1,"usage":{"inputTokens":1,"outputTokens":1,"totalTokens":2},"durationMs":1,"lastMessage":"first"}';
    const second =
      '{"type":"run_result","status":"failed","finishReason":"boom","sessionId":"s1","turnId":"t1","iterations":2,"usage":{"inputTokens":9,"outputTokens":9,"totalTokens":18},"durationMs":2,"lastMessage":"second"}';
    const events = feed(adapter, [terminal, second]);
    expect(only(events, 'loop_end')).toHaveLength(1);
    expect(only(events, 'loop_end')[0]!.finalResult).toBe('first');
    expect(adapter.summary().outcome).toBe('completed');
  });

  it('never reports a clean exit with no run_result as completed', () => {
    // THE invariant of §4.3: unknown, not completed. A process that
    // exited 0 without saying anything did not prove it did the work.
    const adapter = new TryloV1EventAdapter();
    const events = adapter.finalizeExit({ exitCode: 0, stderr: [], cancelled: false });
    const end = only(events, 'loop_end') as LoopEndEvent[];
    expect(end).toHaveLength(1);
    expect(end[0]!.isError).toBe(true);
    expect(adapter.summary().outcome).toBe('unknown');
  });

  it('maps a non-zero exit to failed and keeps the root cause from stderr', () => {
    const adapter = new TryloV1EventAdapter();
    const stderr = traceStderr(TRACE_PRERUN_FAILURE);
    expect(traceExitCode(TRACE_PRERUN_FAILURE)).toBe(52);
    const events = adapter.finalizeExit({ exitCode: 52, stderr, cancelled: false });
    const end = only(events, 'loop_end') as LoopEndEvent[];
    expect(adapter.summary().outcome).toBe('failed');
    // The FIRST stderr line is the cause; the second is advice about a
    // stale lock. Keeping only the tail would report the advice as the
    // reason the run failed.
    expect(end[0]!.finalResult).toContain('missing_session');
  });

  it('caps a chatty stderr instead of dumping it into the transcript', () => {
    const adapter = new TryloV1EventAdapter();
    const noisy = Array.from({ length: 200 }, (_, i) => `line ${i}: ${'x'.repeat(50)}`);
    const events = adapter.finalizeExit({ exitCode: 1, stderr: noisy, cancelled: false });
    const end = only(events, 'loop_end') as LoopEndEvent[];
    expect(end[0]!.finalResult.length).toBeLessThan(600);
    expect(end[0]!.finalResult).toContain('line 0');
    expect(end[0]!.finalResult).not.toContain('line 199');
  });

  it('maps an app-initiated stop to cancelled even on a zero exit', () => {
    const adapter = new TryloV1EventAdapter();
    adapter.finalizeExit({ exitCode: 0, stderr: [], cancelled: true });
    expect(adapter.summary().outcome).toBe('cancelled');
  });

  it('treats an UNDOCUMENTED non-zero exit as a failure', () => {
    // `--ask always` on a non-interactive run exits 13, which is not in
    // the CLI's published EXIT_CODES (0/1/2/41/52/75/130). Enumerating
    // known codes would classify that run as "unknown outcome" and hide
    // a real refusal, so the rule is "non-zero is a failure".
    const adapter = new TryloV1EventAdapter();
    const events = adapter.finalizeExit({
      exitCode: 13,
      stderr: ['allow write_file(...)? [y]once [s]session [n]deny'],
      cancelled: false,
    });
    expect(adapter.summary().outcome).toBe('failed');
    const end = only(events, 'loop_end') as LoopEndEvent[];
    expect(end[0]!.isError).toBe(true);
  });

  it('produces nothing when the process never emitted a byte', () => {
    // Golden trace 05: killed immediately — empty stdout, exit 1.
    expect(traceLines(TRACE_CANCELLED)).toHaveLength(0);
    const adapter = new TryloV1EventAdapter();
    const events = adapter.finalizeExit({ exitCode: 1, stderr: [], cancelled: true });
    expect(only(events, 'loop_end')).toHaveLength(1);
    expect(adapter.summary().outcome).toBe('cancelled');
  });

  it('finalizeExit is a no-op once a terminal event exists', () => {
    const { adapter } = project(TRACE_SUCCESS);
    expect(adapter.finalizeExit({ exitCode: 1, stderr: [], cancelled: false })).toHaveLength(0);
    expect(adapter.summary().outcome).toBe('completed');
  });
});

describe('TryloV1EventAdapter — wire guard', () => {
  it('rejects a truncated final line instead of projecting garbage', () => {
    const adapter = new TryloV1EventAdapter();
    // A half-written line is what a killed process leaves behind.
    const events = adapter.feed('{"type":"message_delta","text":"half');
    expect(events).toHaveLength(0);
    expect(adapter.rejectedLines().map((r) => r.reason)).toContain('malformed_json');
  });

  it('rejects an unknown event type instead of passing it through', () => {
    // This is the legacy fast-path bug in one line: a known-looking
    // frame from a future protocol version must not become a LoopEvent.
    const adapter = new TryloV1EventAdapter();
    expect(adapter.feed('{"type":"subagent_spawn","id":"x"}')).toHaveLength(0);
    expect(adapter.rejectedLines().map((r) => r.reason)).toContain('unknown_type');
  });

  it('rejects a known type with wrong fields', () => {
    const adapter = new TryloV1EventAdapter();
    // `tool_use` without a name is not a tool call.
    expect(adapter.feed('{"type":"tool_use","toolCallId":"c1"}')).toHaveLength(0);
    expect(adapter.rejectedLines().map((r) => r.reason)).toContain('invalid_fields');
  });

  it('treats blank lines as framing noise, not as an error', () => {
    const adapter = new TryloV1EventAdapter();
    expect(adapter.feed('')).toHaveLength(0);
    expect(adapter.feed('   ')).toHaveLength(0);
    expect(adapter.rejectedLines()).toHaveLength(0);
  });

  it('never lets a rejected line reach the projected events', () => {
    const adapter = new TryloV1EventAdapter();
    const lines = [
      '{"type":"message_start"}',
      'not json at all',
      '{"type":"message_delta","text":"hi"}',
      '{"type":"nonsense"}',
      '{"type":"message_end"}',
    ];
    const events = feed(adapter, lines);
    // A delta emits a partial, the `message_end` seals it — two events,
    // one bubble. Rejected lines must not add a third.
    const texts = only(events, 'text') as TextEvent[];
    expect(texts).toHaveLength(2);
    expect(texts[0]!.partial).toBe(true);
    expect(texts[1]!.fullText).toBe('hi');
    expect(adapter.rejectedLines()).toHaveLength(2);
  });
});

describe('TryloV1EventAdapter — reasoning', () => {
  it('projects reasoning deltas and seals them on reasoning_end', () => {
    const adapter = new TryloV1EventAdapter();
    const events = feed(adapter, [
      '{"type":"reasoning_start","redacted":false}',
      '{"type":"reasoning_delta","text":"Let me read the file. "}',
      '{"type":"reasoning_delta","text":"Then I will patch it."}',
      '{"type":"reasoning_end"}',
    ]);
    const thinking = only(events, 'thinking') as ThinkingEvent[];
    expect(thinking.length).toBeGreaterThanOrEqual(2);
    const final = thinking[thinking.length - 1]!;
    expect(final.partial).toBe(false);
    expect(final.preview).toContain('patch it');
  });

  it('projects no reasoning body when the stream is redacted', () => {
    const adapter = new TryloV1EventAdapter();
    const events = feed(adapter, [
      '{"type":"reasoning_start","redacted":true}',
      '{"type":"reasoning_delta","text":"secret chain of thought"}',
      '{"type":"reasoning_end"}',
    ]);
    const thinking = only(events, 'thinking') as ThinkingEvent[];
    for (const t of thinking) {
      expect(t.preview).not.toContain('secret');
    }
    // It still says that reasoning happened.
    expect(thinking.some((t) => t.summary.length > 0)).toBe(true);
  });
});

// Round-3 P2. The acceptance run leaked a literal `</think>` into the
// transcript (leveldb `001985.log`, session `code-musy5wnw-sz4xu`, 2 text
// records). Root cause: this provider returns chain-of-thought on the TEXT
// channel, so the tag arrives as ordinary `message_delta` text.
describe('TryloV1EventAdapter — think tags on the text channel', () => {
  it('does not project a literal </think> into the text bubble', () => {
    const adapter = new TryloV1EventAdapter();
    const events = feed(adapter, [
      '{"type":"message_start"}',
      '{"type":"message_delta","text":"Let me run it.</think>Let me execute the helper."}',
      '{"type":"message_end"}',
    ]);
    const text = only(events, 'text') as TextEvent[];
    const final = text[text.length - 1]!;
    expect(final.fullText).toBe('Let me run it.Let me execute the helper.');
    expect(final.fullText).not.toContain('think');
  });

  it('drops reasoning prose that arrived wrapped in <think>…</think>', () => {
    const adapter = new TryloV1EventAdapter();
    const events = feed(adapter, [
      '{"type":"message_start"}',
      '{"type":"message_delta","text":"Answer: 42.<think>secret</think> Done."}',
      '{"type":"message_end"}',
    ]);
    const text = only(events, 'text') as TextEvent[];
    const final = text[text.length - 1]!;
    expect(final.fullText).toBe('Answer: 42. Done.');
  });

  it('survives a tag split across two message_delta frames', () => {
    const adapter = new TryloV1EventAdapter();
    const events = feed(adapter, [
      '{"type":"message_start"}',
      '{"type":"message_delta","text":"before </thi"}',
      '{"type":"message_delta","text":"nk> after"}',
      '{"type":"message_end"}',
    ]);
    const text = only(events, 'text') as TextEvent[];
    const final = text[text.length - 1]!;
    expect(final.fullText).toBe('before  after');
  });

  it('does not carry a stray <think> from one message into the next', () => {
    const adapter = new TryloV1EventAdapter();
    const events = feed(adapter, [
      '{"type":"message_start"}',
      '{"type":"message_delta","text":"unterminated"}',
      '{"type":"message_end"}',
      '{"type":"message_start"}',
      '{"type":"message_delta","text":"<think>"}',
      '{"type":"message_delta","text":"still inside"}',
      '{"type":"message_end"}',
      '{"type":"message_start"}',
      '{"type":"message_delta","text":"fresh answer"}',
      '{"type":"message_end"}',
    ]);
    const text = only(events, 'text') as TextEvent[];
    const last = text[text.length - 1]!;
    expect(last.fullText).toBe('fresh answer');
  });
});

describe('parseCliV1Event', () => {
  it('accepts every captured golden line', () => {
    // A regression here means the CLI moved and nobody told Desktop.
    for (const trace of [TRACE_SUCCESS, TRACE_WRITE_TOOL, TRACE_DENIED]) {
      for (const line of traceLines(trace)) {
        const parsed = parseCliV1Event(line);
        expect(parsed.ok, `${trace}: ${line}`).toBe(true);
      }
    }
  });
});
