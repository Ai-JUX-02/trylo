import type { JobStore } from "../../ports/background-job.js";
import type { ProcessSessionEndReason, ProcessSessionId } from "../../ports/process-session.js";

/**
 * Publishing what the process-session registry knows into the durable job table
 * (WP26 / A04), so `trylo bg` in a second terminal can see this process's jobs.
 *
 * Kept out of `session-registry.ts` for two reasons: the registry is WP06/WP07's
 * owner of a live session and should not grow a second concern; and the rules
 * below are about *what may be recorded*, which is the job table's business.
 *
 * ## The rules this module exists to enforce
 *
 *  - **Only the owner writes an ending.** `ended` fires from the owner's `exit`
 *    event, the one moment an exit code is a fact. A reader that later finds the
 *    pid gone writes `lost` with no code (`job-store.markLost`), because "the
 *    process table says it is not there" is not evidence about how it left.
 *    Gemini's `shellExecutionService.ts:819-822` maps a spawn `error` to
 *    `handleExit(1)`; that is the mistake this shape makes hard to commit.
 *  - **Output is a mirror, not a second owner.** The in-memory buffer stays the
 *    model's view; the file is what another process reads. The stated cost: if the
 *    owner dies, the file stops growing even though the job may still run.
 *  - **A record without a pid is not published.** A second terminal could neither
 *    verify it nor stop it, so publishing one would advertise something `bg kill`
 *    cannot honour.
 *  - **Publication failures are not session failures.** A disk that will not take
 *    the record leaves the session running and `bg ps` one job short — the honest
 *    direction of lying.
 */
export type SessionPublication = {
  readonly started: (session: {
    readonly id: ProcessSessionId;
    readonly pid: number | undefined;
    readonly command: string;
    readonly cwd: string;
    readonly startedAtMs: number;
  }) => void;
  readonly output: (id: ProcessSessionId, chunk: Buffer) => void;
  readonly ended: (id: ProcessSessionId, end: ProcessSessionEndReason) => void;
};

/** The part of the job table a registry needs, named so the registry imports once. */
export type SessionJobs = Pick<JobStore, "publish" | "append" | "settle"> | undefined;

export function publishSessionsTo(jobs: SessionJobs): SessionPublication {
  if (jobs === undefined) {
    // The shape stays the same whether or not a table is wired, so the registry
    // has no `if (jobs)` at each of its four call sites.
    return { started: () => {}, output: () => {}, ended: () => {} };
  }
  return {
    started: (session) => {
      if (session.pid === undefined) {
        return;
      }
      jobs.publish({
        id: session.id,
        pid: session.pid,
        command: session.command,
        cwd: session.cwd,
        startedAtMs: session.startedAtMs,
      });
    },
    output: (id, chunk) => {
      jobs.append(id, chunk);
    },
    ended: (id, end) => {
      jobs.settle(id, end);
    },
  };
}
