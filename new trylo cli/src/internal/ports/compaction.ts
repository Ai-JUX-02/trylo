import type { SessionRecord } from "./session.js";
import type { TranscriptItem } from "../protocol/transcript.js";

/**
 * Context-window budget management for a durable session journal.
 *
 * Three things together make compaction real, and each one alone is a trap:
 *  - a *threshold* that decides when shrinking is due;
 *  - a *summary record* appended to the journal, never a rewrite of it;
 *  - a *read-time filter* so the model stops seeing what the summary replaced.
 *
 * Ownership: this package decides what a window means and what the model sees.
 * It never writes to disk — the session store remains the single writer of the
 * journal, so `compact` hands back a draft for the loop (or a fake loop, here)
 * to append.
 *
 * The journal's append-only property is load bearing: history already ack-
 * nowledged is never reinterpreted, only excluded.
 */

export const COMPACTION_FORMAT_VERSION = "1";

/**
 * Exactly five keys. A sixth one —however harmless it looks in this build— is
 * rejected rather than ignored, because "ignore unknown field" is how a later
 * format silently loses meaning when read by an older binary.
 */
export const COMPACT_WINDOW_KEYS = [
  "windowId",
  "replacedFromSequence",
  "replacedToSequence",
  "summary",
  "formatVersion",
] as const;

export type CompactWindow = {
  /** Monotonic per session: `w1`, `w2`, … Derived from what is already stored. */
  readonly windowId: string;
  /** First journal sequence the summary stands in for. */
  readonly replacedFromSequence: number;
  /** Last journal sequence the summary stands in for, inclusive. */
  readonly replacedToSequence: number;
  /** Plain text, bounded, scrubbed. Never renders paths or credentials. */
  readonly summary: string;
  readonly formatVersion: string;
};

/** What the model is shown. The UI keeps reading the full journal instead. */
export type PromptView = {
  /** Live transcript items, oldest first, in journal order. */
  readonly items: readonly TranscriptItem[];
  /** The newest window whose upper bound is at or below the horizon. */
  readonly window: CompactWindow | undefined;
  /** The horizon the view was computed under, when one was supplied. */
  readonly horizonSequence: number | undefined;
};

export type CompactionHoldReason = "within_limit" | "nothing_to_compact";
export type CompactionTriggerReason = "estimated_tokens_reached_limit";

export type CompactionDecision =
  | { readonly outcome: "hold"; readonly reason: CompactionHoldReason }
  | { readonly outcome: "compact"; readonly reason: CompactionTriggerReason };

/**
 * Everything `shouldCompact` may look at is here, and nothing else: no wall
 * clock, no provider identity, no disk. The token estimate arrives as an
 * already-computed integer so the policy stays a pure comparison that a test
 * can drive from both sides of the boundary.
 */
export type CompactionProbe = {
  readonly view: PromptView;
  readonly contextTokenLimit: number;
  readonly estimatedPromptTokens: number;
};

/** Upper bound on a summary. A summary that needs more room is not a summary. */
export const SUMMARY_MAX_CHARS = 4_000;

export type PromptProjectionFailureCode =
  | "compact_payload_malformed"
  | "compact_format_unknown"
  | "compact_window_not_monotonic";

export type PromptProjectionFailure = {
  readonly ok: false;
  readonly code: PromptProjectionFailureCode;
  /** Names the offending journal sequence; never echoes summary text. */
  readonly detail: string;
};

export type PromptProjectionOutcome =
  | { readonly ok: true; readonly view: PromptView }
  | PromptProjectionFailure;

export type CompactFailureCode =
  | "nothing_to_compact"
  | "compact_window_not_monotonic"
  | "compact_payload_malformed"
  | "compact_format_unknown"
  | "summary_empty"
  | "summary_too_long"
  | "summary_unsafe";

export type CompactFailure = {
  readonly ok: false;
  readonly code: CompactFailureCode;
  readonly detail: string;
};

/** Accepted verbatim by `SessionPort.append`; the store owns sequence and version. */
export type CompactRecordDraft = {
  readonly type: "compact";
  readonly sessionId: string;
  readonly at: string;
  readonly payload: CompactWindow;
};

export type CompactSuccess = {
  readonly ok: true;
  readonly record: CompactRecordDraft;
};

export type CompactOutcome = CompactSuccess | CompactFailure;

export type CompactRequest = {
  /** Full journal, oldest first, exactly as the record view returns it. */
  readonly records: readonly SessionRecord[];
  readonly sessionId: string;
  readonly at: string;
  /** Already-authored summary text; validated here, never trusted blindly. */
  readonly summary: string;
  /** Active rollback horizon, when the caller is projecting one. */
  readonly horizonSequence?: number;
};

export type RollbackFailureCode = "nothing_to_roll_back" | "sequence_unknown";

export type RollbackFailure = {
  readonly ok: false;
  readonly code: RollbackFailureCode;
  readonly detail: string;
};

export type RollbackOutcome =
  | { readonly ok: true; readonly horizonSequence: number }
  | RollbackFailure;

export type CompactionPort = {
  shouldCompact(probe: CompactionProbe): CompactionDecision;
  projectForPrompt(input: {
    readonly records: readonly SessionRecord[];
    readonly horizonSequence?: number;
  }): PromptProjectionOutcome;
  compact(request: CompactRequest): CompactOutcome;
  /**
   * View-only. Validates a horizon and hands it back for the caller to carry;
   * `projectForPrompt` is the only thing it changes. It never edits a file, a
   * journal or the workspace. Undoing *files* is the checkpoint rail's job, a
   * separate call on a separate port.
   */
  rollbackTranscript(input: {
    readonly records: readonly SessionRecord[];
    readonly sequence: number;
  }): RollbackOutcome;
};
