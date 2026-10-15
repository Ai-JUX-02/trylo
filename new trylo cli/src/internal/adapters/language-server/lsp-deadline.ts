/**
 * One deadline, one meaning: the request is over.
 *
 * The distinction this file insists on is the one this package keeps getting
 * wrong. A timeout is **not** "no results". After a timeout the connection may
 * still be alive or may be wedged, and the next query has to be told which — so
 * a timeout produces a typed failure and, through `onTimeout`, cancels the work
 * that was still running. Silently returning an empty answer here is how a
 * project ends up looking like it has no definitions at all.
 */

export class DeadlineExceeded extends Error {
  constructor(readonly timeoutMs: number) {
    super(`lsp request exceeded ${timeoutMs}ms`);
    this.name = "DeadlineExceeded";
  }
}

/**
 * `ReturnType<typeof setTimeout>` rather than a hand-written `{ unref(): void }`:
 * the structural version is not assignable back to `clearTimeout`, which is the
 * kind of near-miss that makes a reader distrust the whole file.
 */
type Timer = ReturnType<typeof setTimeout>;

/**
 * @param onTimeout invoked exactly once, before the rejection, so the caller can
 * release whatever the abandoned request was holding.
 */
export async function withDeadline<T>(work: Promise<T>, timeoutMs: number, onTimeout: () => void): Promise<T> {
  let timer: Timer | undefined;
  try {
    return await new Promise<T>((resolve, reject) => {
      timer = setTimeout(() => {
        // Cancel first, then reject: a caller that retries immediately must not
        // find the previous request still holding a slot.
        onTimeout();
        reject(new DeadlineExceeded(timeoutMs));
      }, timeoutMs);
      // Deliberately NOT unref'd. An unref'd timer lets the event loop drain
      // while a request is still outstanding, which cancels the very tests that
      // assert timeout behaviour and, in production, would let the process exit
      // mid-query. The timer is always cleared in `finally`, so it cannot outlive
      // the request it guards.
      work.then(resolve, reject);
    });
  } finally {
    if (timer !== undefined) {
      clearTimeout(timer);
    }
  }
}
