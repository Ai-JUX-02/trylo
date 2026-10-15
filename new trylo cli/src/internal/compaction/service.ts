import {
  COMPACTION_FORMAT_VERSION,
  type CompactOutcome,
  type CompactRequest,
  type CompactWindow,
  type CompactionPort,
  type RollbackOutcome,
} from "../ports/compaction.js";
import type { SessionRecord } from "../ports/session.js";
import { shouldCompact } from "./policy.js";
import { projectForPrompt } from "./projection.js";
import { collectWindows } from "./window.js";
import { validateSummary } from "./summary.js";

/**
 * Composition point for the compaction behaviours. It owns no state and
 * touches no storage: `compact` returns a draft for the session store to append,
 * which keeps one writer for the journal. The rollback horizon is handed back to
 * the caller to carry forward, so nothing here remembers anything between calls.
 *
 * The read-time view comes from `projection.ts`, which is also where the
 * tool-result microcompact (WP09.1/L36) is applied — one projection path, so
 * every reader of "what the model sees" sees the same elision.
 */

export function createCompactionService(): CompactionPort {
  return {
    shouldCompact,
    projectForPrompt,
    compact,
    rollbackTranscript,
  };
}

function compact(request: CompactRequest): CompactOutcome {
  const scanned = collectWindows(request.records, request.horizonSequence);
  if (!scanned.ok) {
    return scanned;
  }
  const windows = scanned.windows;
  const previous = windows[windows.length - 1];
  const bounds = liveTranscriptBounds(request.records, previous, request.horizonSequence);
  if (bounds === undefined) {
    return { ok: false, code: "nothing_to_compact", detail: "no live transcript items" };
  }
  const replacedFromSequence = previous === undefined ? 0 : previous.replacedToSequence + 1;
  if (bounds.last < replacedFromSequence) {
    return {
      ok: false,
      code: "compact_window_not_monotonic",
      detail: `${bounds.last} < ${replacedFromSequence}`,
    };
  }
  const validated = validateSummary(request.summary);
  if (!validated.ok) {
    return validated;
  }
  const window: CompactWindow = {
    // Derived from what is already stored, so the identifier cannot drift when
    // two writers race: whoever appends second gets the next number or nothing.
    windowId: `w${windows.length + 1}`,
    replacedFromSequence,
    replacedToSequence: bounds.last,
    summary: request.summary,
    formatVersion: COMPACTION_FORMAT_VERSION,
  };
  return {
    ok: true,
    record: { type: "compact", sessionId: request.sessionId, at: request.at, payload: window },
  };
}

function liveTranscriptBounds(
  records: readonly SessionRecord[],
  previous: CompactWindow | undefined,
  horizonSequence: number | undefined,
): { readonly first: number; readonly last: number } | undefined {
  const from = previous === undefined ? 0 : previous.replacedToSequence + 1;
  const upperBound = horizonSequence ?? Number.POSITIVE_INFINITY;
  let first: number | undefined;
  let last: number | undefined;
  for (const record of records) {
    if (record.sequence < from || record.sequence > upperBound) {
      continue;
    }
    if (record.type !== "transcript_item") {
      continue;
    }
    if (first === undefined) {
      first = record.sequence;
    }
    last = record.sequence;
  }
  return first === undefined || last === undefined ? undefined : { first, last };
}

function rollbackTranscript(input: {
  readonly records: readonly SessionRecord[];
  readonly sequence: number;
}): RollbackOutcome {
  const last = input.records[input.records.length - 1];
  const highest = last?.sequence ?? -1;
  if (!Number.isInteger(input.sequence) || input.sequence < 0 || highest < 0) {
    return { ok: false, code: "sequence_unknown", detail: `${input.sequence}` };
  }
  if (input.sequence >= highest) {
    return { ok: false, code: "nothing_to_roll_back", detail: `${input.sequence} >= ${highest}` };
  }
  return { ok: true, horizonSequence: input.sequence };
}
