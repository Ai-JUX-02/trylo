import type { SessionPort } from "../../ports/session.js";

type AppendResult = Awaited<ReturnType<SessionPort["append"]>>;
const MAX_PENDING_APPENDS = 128;

/** One bounded append lane for loop and subagent facts, with a sticky failure. */
export function serializeSessionWrites(base: SessionPort): SessionPort {
  let tail = Promise.resolve();
  let pending = 0;
  let failure: { readonly ok: false; readonly code: string } | undefined;
  return {
    start: input => base.start(input),
    attach: () => base.attach(),
    async append(record): Promise<AppendResult> {
      if (pending >= MAX_PENDING_APPENDS) {
        failure ??= { ok: false, code: "session_write_queue_full" };
        return failure;
      }
      pending++;
      const operation = tail.then(async (): Promise<AppendResult> => {
        if (failure !== undefined) return failure;
        try {
          const outcome = await base.append(record);
          if (!outcome.ok) failure = outcome;
          return outcome;
        } catch {
          failure = { ok: false, code: "session_append_threw" };
          return failure;
        }
      });
      tail = operation.then(() => { pending--; });
      return operation;
    },
    async read() { await tail; return base.read(); },
    async readRecords() { await tail; return base.readRecords(); },
    async repairTornTail() { await tail; return base.repairTornTail(); },
    async release() { await tail; await base.release(); },
  };
}
