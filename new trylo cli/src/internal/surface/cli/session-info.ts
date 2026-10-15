import type { LearningSwitch, RunCommandOptions } from "./args.js";
import type { SessionRecord } from "../../ports/session.js";
import type { RunScaffold } from "./run-command.js";
import { aligned } from "./humanize.js";
import type { TuiUsage } from "./tui/state.js";

/**
 * What a session is, and what the last turn cost.
 *
 * One rendering for both REPLs, because there are two: the TUI keeps a frame
 * state that has accumulated usage, and the line REPL does not, and a command
 * that answers differently on a terminal than in a pipe is a command that
 * cannot be trusted. Both call these; the line REPL passes no usage and gets
 * the honest "not reported" line rather than a number someone invented.
 *
 * Pure, and `TuiUsage` is imported as a type only: this file is about the
 * shape of a usage record, not about the TUI that holds one.
 */

/**
 * The journal as it stands, when the session has one.
 *
 * `undefined` rather than empty: "this session has no journal" and "this
 * journal is empty" are different facts, and a caller that conflates them will
 * happily report a compaction that wrote nothing.
 *
 * Shared because three places need it: each REPL after a turn, and `/compact`.
 */
export async function journalRecordsOf(
  scaffold: RunScaffold,
): Promise<ReadonlyArray<SessionRecord> | undefined> {
  if (scaffold.session === undefined) {
    return undefined;
  }
  const read = await scaffold.session.readRecords();
  return read.ok ? read.view.records : undefined;
}

export type SessionFacts = {
  readonly sessionId: string;
  readonly providerId: string;
  readonly model: string;
  readonly maxIterations: number | undefined;
  /**
   * The context ceiling this run resolved to, when one was declared.
   *
   * Optional because not every provider declares a window; without it a
   * context percentage would be a number invented from a number nobody gave,
   * and the bar has a rule about that.
   */
  readonly contextTokenLimit: number | undefined;
};

/**
 * The options for a session that runs on `model`.
 *
 * The id is a **new** one, not the current session's, and that is a constraint
 * found by trying the other thing first: resuming the current journal under a
 * different model is refused outright (`model changed: <old> -> <new>`), because
 * a journal records the model that produced it. So switching models means
 * starting a session, and the caller says so on screen rather than pretending
 * the history carried over.
 *
 * `session` rather than `resume` for the same reason: `resume` would carry the
 * old journal and hit that check.
 */
export function modelSwitchOptions(
  sessionId: string,
  model: string,
  learning?: LearningSwitch,
): RunCommandOptions {
  return {
    message: [],
    readStdin: false,
    session: sessionId,
    model,
    ...(learning === undefined ? {} : { learning }),
  };
}


/** What `/status` prints: the facts a run was opened with, and nothing guessed. */
export function statusLines(facts: SessionFacts, iterations: number | undefined): ReadonlyArray<string> {
  return aligned([
    ["session", facts.sessionId],
    ["provider", facts.providerId],
    ["model", facts.model],
    [
      "iterations",
      `${iterations ?? "-"} / ${facts.maxIterations ?? "-"}`,
    ],
  ]);
}

/**
 * What `/usage` prints.
 *
 * "not reported" rather than zero: a provider that never answers with a usage
 * block is not the same as a turn that cost nothing, and printing `0` for the
 * first is how a person ends up believing a run was free.
 */
export function usageLines(
  usage: TuiUsage | undefined,
  durationMs: number | undefined,
): ReadonlyArray<string> {
  if (usage === undefined) {
    return ["no usage reported yet; the provider may not report it"];
  }
  // Every row goes through `aligned`, including the duration: a line appended
  // after the fact is a line that starts in the wrong column.
  return aligned([
    ["input", String(usage.inputTokens)],
    ["output", String(usage.outputTokens)],
    ["total", String(usage.totalTokens)],
    ...(durationMs === undefined ? [] : [["elapsed", `${(durationMs / 1000).toFixed(1)}s`]]),
  ]);
}
