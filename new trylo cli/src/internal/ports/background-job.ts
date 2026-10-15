import type { ProcessSessionEndReason, ProcessSessionId, ProcessSessionStatus } from "./process-session.js";

/**
 * A background job as it exists **on disk**, so a second terminal can answer
 * "what is running, what did it print, stop it" (WP26 / A04, `trylo bg`).
 *
 * ## Why this is a separate contract from the registry
 *
 * `ports/process-session.ts` describes a live session inside one process, and the
 * registry that owns it keeps its output in a bounded memory buffer. Both of those
 * are correct — and neither survives the process that created it. This record is
 * the same *fact* ("this command is running and this is its output") written where
 * another process can read it.
 *
 * Deliberately **not** a second status vocabulary: `status` reuses
 * `ProcessSessionStatus`, so `running/exited/failed/lost` mean one thing across
 * the memory view and the disk view. A parallel vocabulary would be two opinions
 * about the same lifecycle, which is the failure this repo keeps naming.
 *
 * ## What no field may claim
 *
 * `exitCode` and `signal` exist **only** when the process that started the job saw
 * its `exit` event. A reader that finds a stale `running` record marks it `lost`
 * and leaves `endedAtMs` unset: "the machine says that pid is gone" is a fact,
 * while "it exited 0" would be invented. This mirrors codex's `PidRecord`, which
 * stores no status at all so a lie is unrepresentable, and gemini's
 * `ExecutionLifecycleService.background()`, which writes `exitCode: null`
 * explicitly rather than defaulting to 0.
 */
export type BackgroundJobRecord = {
  readonly id: ProcessSessionId;
  /** The backgrounded process itself. */
  readonly pid: number;
  /** The process that started it — whose `exit` event is the only source of an exit code. */
  readonly ownerPid: number;
  /** What was run, for display. Not a shell command to re-execute. */
  readonly command: string;
  readonly cwd: string;
  readonly startedAtMs: number;
  readonly status: ProcessSessionStatus;
  readonly endedAtMs?: number;
  readonly exitCode?: number;
  readonly signal?: string;
  /** Set only with `failed`: the spawn itself never produced a live process. */
  readonly failure?: string;
  readonly logPath: string;
  /** Bytes written to `logPath` so far, and whether output was dropped past the cap. */
  readonly logBytes: number;
  readonly droppedOutput: boolean;
};

/** What a starter knows at the moment it has a pid. */
export type BackgroundJobStart = {
  readonly id: ProcessSessionId;
  readonly pid: number;
  readonly command: string;
  readonly cwd: string;
  readonly startedAtMs: number;
};

/** Why a read failed. `unreadable` is never collapsed into `missing`. */
export type BackgroundJobReadFailure = "missing" | "unreadable";

export type BackgroundJobRead =
  | { readonly ok: true; readonly record: BackgroundJobRecord; readonly raw: string }
  | { readonly ok: false; readonly code: BackgroundJobReadFailure; readonly detail: string };

/** Reading a job's log tail: bytes, plus whether the front of it was skipped. */
export type JobOutputRead =
  | { readonly ok: true; readonly text: string; readonly truncatedFromStart: boolean }
  | { readonly ok: false; readonly detail: string };

/**
 * The one writable door to the job table.
 *
 * `raw` is returned by {@link JobStore.read} so a caller that wants to change a
 * record can hand back exactly the text it saw: the store rewrites only if the
 * file still contains it (compare-and-set). Without that, a reader marking a dead
 * job `lost` could silently swallow the owner's write of the real exit code —
 * which is precisely the race cline's `background-terminal.ts` example has with
 * its bare `writeFileSync` read-modify-write, and why codex deletes only after
 * re-comparing the bytes it read.
 */
export type JobStore = {
  /** Publish a running job. Idempotent per id; a failed publish is reported, not thrown. */
  publish(start: BackgroundJobStart): boolean;
  /** Append output the owner has already buffered. Bounded; overflow marks `droppedOutput`. */
  append(id: ProcessSessionId, chunk: Buffer): void;
  /** Settle a job the owner observed ending. `exited` carries a code, `failed` must not gain one. */
  settle(id: ProcessSessionId, end: ProcessSessionEndReason): boolean;
  read(id: ProcessSessionId): BackgroundJobRead;
  /**
   * The tail of a job's output, bounded by the store's own read cap.
   *
   * The cap lives here rather than at the call site so `bg logs` cannot ask for
   * "the whole file" and load a megabyte-chatty job into a terminal.
   */
  readOutput(id: ProcessSessionId): JobOutputRead;
  /** Every record on disk, newest first. Unreadable ones are reported, never dropped. */
  list(): ReadonlyArray<BackgroundJobRead>;
  /**
   * Mark a job `lost` iff the file still holds `expectedRaw`.
   *
   * Returns false when someone else wrote first — which is the correct outcome,
   * not a failure to retry: that other writer is the owner reporting a real exit.
   */
  markLost(id: ProcessSessionId, expectedRaw: string): boolean;
  /** Drop finished jobs older than the retention window; returns how many went. */
  sweep(nowMs: number): number;
};

/** Where the table lives, relative to `tryloHome`. */
export const JOBS_DIR_REL = "jobs";

/** How long a finished job and its log survive before being swept. */
export const JOB_RETENTION_MS = 7 * 24 * 60 * 60 * 1000;

/**
 * The cap on one job's log file, and on one `logs` read.
 *
 * Two different numbers on purpose: the cap is what we are willing to keep per
 * job, the read limit is what one command should load into a terminal. gemini
 * tails 64 KB per read but caps nothing on write (a chatty loop can fill a disk);
 * cline's example reads the whole file. Both ends get a bound here.
 */
export const JOB_LOG_MAX_BYTES = 8 * 1024 * 1024;
export const JOB_LOG_READ_MAX_BYTES = 64 * 1024;
