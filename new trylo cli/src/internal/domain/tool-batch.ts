/**
 * A batch of tool calls in flight at once (WP D 波 §5.1).
 *
 * The single-value `activeToolCallId` cannot express "several tools are running;
 * the next request starts when all of them have landed". These functions are the
 * whole of that idea, kept pure so the rule lives in one testable place instead
 * of being re-derived by the reducer and the runner separately.
 *
 * The batch is *additive* with the single-value path: a run that never opens a
 * batch has no `activeToolCallIds` at all, and every function here is a no-op for
 * it. That is what makes "parallel off behaves byte for byte as before" a fact
 * rather than a promise.
 */

/**
 * Add one call to the batch. Duplicate ids are ignored: a tool call is issued
 * once, and counting it twice would make the batch never settle.
 */
export function openBatch(
  ids: ReadonlyArray<string>,
  toolCallId: string,
): ReadonlyArray<string> {
  if (ids.includes(toolCallId)) {
    return ids;
  }
  return [...ids, toolCallId];
}

/** Remove one settled call. Unknown ids are ignored for the same reason. */
export function settleBatch(
  ids: ReadonlyArray<string>,
  toolCallId: string,
): ReadonlyArray<string> {
  return ids.filter((id) => id !== toolCallId);
}

export function batchSettled(ids: ReadonlyArray<string>): boolean {
  return ids.length === 0;
}

/**
 * Stable completion order for a batch.
 *
 * The tools run concurrently, but their results are dispatched in id order so
 * two runs of the same batch produce the same journal. Concurrency is about
 * *when* the work happens, never about the order it is recorded in.
 */
export function settlementOrder(ids: ReadonlyArray<string>): ReadonlyArray<string> {
  return [...ids].sort();
}
