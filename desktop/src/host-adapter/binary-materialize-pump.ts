import type { LoopEvent } from './loop-events';
import { materializeToolResultEvents, hasRawToolResultEvents } from '../tooling/tool-result-store';

/**
 * PR-4 (spec §7.1): BinaryRef materialization pump. The stream translator
 * emits tool_result content with RAW base64 blocks; before any of that can
 * reach the reducer / UI / conversation history, each block is written to
 * the ephemeral tool cache and replaced by a `BinaryRef`. Batches are
 * dispatched strictly in arrival order through a per-process promise chain
 * — a slow cache write must never reorder tool_result behind later events.
 * A pump failure degrades to dispatching the batch as-is (the reducer's
 * persisted-shape guard still strips raw base64), never stalls the stream.
 */
export function createBinaryMaterializePump(): (
  events: readonly LoopEvent[],
  dispatch: (events: readonly LoopEvent[]) => void,
) => void {
  let chain: Promise<void> = Promise.resolve();
  let pending = 0;
  const dispatchOnce = (events: readonly LoopEvent[], dispatch: (events: readonly LoopEvent[]) => void) => {
    try {
      dispatch(events);
    } catch (error) {
      // Consumer failures cannot be retried as materialization failures: the
      // consumer may already have appended part of this batch.
      // eslint-disable-next-line no-console
      console.warn('[trylo] event consumer failed; batch was not redispatched', error);
    }
  };
  return (events, dispatch) => {
    // Synchronous fast path: a batch without raw base64 blocks is
    // dispatched inline. The event stream stays fully synchronous for
    // pure-text results (all of today's traffic) — the async pump only
    // engages when binary materialization is actually needed.
    const needsMaterialization = hasRawToolResultEvents(events);
    if (pending === 0 && !needsMaterialization) {
      dispatchOnce(events, dispatch);
      return;
    }
    pending += 1;
    chain = chain
      .then(async () => {
        let ready = events;
        if (needsMaterialization) {
          try {
            ready = await materializeToolResultEvents(events);
          } catch (error) {
            // Keep the existing bounded fallback; persistence strips inline
            // binary payloads. Only materialization failure takes this branch.
            // eslint-disable-next-line no-console
            console.warn('[trylo] binary materialization failed; delivering fallback once', error);
          }
        }
        dispatchOnce(ready, dispatch);
      })
      .finally(() => {
        pending -= 1;
      });
  };
}

