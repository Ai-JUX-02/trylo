// Trylo Desktop — what actually happened to a guidance message injected into
// a running turn (Round-3 P0-5).
//
// Before this module, `steer()` answered a single boolean: TRUE meant "the
// bytes went down the pipe", FALSE meant "something stopped me". The UI turned
// FALSE into one hard red card — `⚠ Task failed / 当前任务没有接受这条引导，
// 请重试或先停止任务` — regardless of WHICH of four very different things had
// happened:
//
//   1. the runtime has no steering at all (trylo-v1: one process per turn,
//      stdin closed after the prompt — P08 §3.3). NOTHING was attempted, so
//      "the task did not accept your guidance" is simply false.
//   2. no live process / no busy run to inject into.
//   3. the stdin write really failed (process gone, stdin closed).
//   4. the write succeeded.
//
// Collapsing those into "failed" is how a report gets the label wrong in both
// directions at once. This union is the wire: every outcome is distinguishable,
// and each one gets its OWN honest message. Note there is no timer anywhere on
// this path — nothing here judges success from a grace period expiring.
//
// What this module deliberately does NOT do: infer success from the message
// stream. `turnId` on assistant/tool rows is stamped DESKTOP-SIDE from the id
// of the last user message in the array (see events.ts → lastUserIndex), so
// once the guidance bubble exists, every following row inherits its id whether
// or not the CLI ever saw the text. Treating that as proof of acceptance would
// be a fact-free "success" — worse than the red card.

export type SteerDelivery =
  /** The frame reached the running CLI's stdin. That is the whole claim:
   *  delivered, not obeyed. */
  | { readonly kind: 'delivered' }
  /** This runtime cannot inject into a running turn. Nothing was attempted. */
  | { readonly kind: 'unsupported' }
  /** Nothing is running (or the controller has no busy process). */
  | { readonly kind: 'not-running' }
  /** A live run was there but the stdin write did not go through. */
  | { readonly kind: 'write-failed' };

export const STEER_DELIVERED: SteerDelivery = { kind: 'delivered' };
export const STEER_UNSUPPORTED: SteerDelivery = { kind: 'unsupported' };
export const STEER_NOT_RUNNING: SteerDelivery = { kind: 'not-running' };

/** Outcomes that are the user's fault to retry. `unsupported` is NOT one —
 *  retrying cannot change what the runtime can do. */
export function isSteerRetryable(delivery: SteerDelivery): boolean {
  return delivery.kind === 'write-failed' || delivery.kind === 'not-running';
}

/** Whether the guidance text reached anything at all. */
export function isSteerDelivered(delivery: SteerDelivery): boolean {
  return delivery.kind === 'delivered';
}

/**
 * User-facing line for an outcome, or `null` when there is nothing to say
 * (a delivered guidance needs no apology). Chinese-first: the app is Chinese.
 */
export function steerOutcomeText(delivery: SteerDelivery): string | null {
  switch (delivery.kind) {
    case 'delivered':
      return null;
    case 'unsupported':
      return '当前 CLI 不支持在运行中打断；这条引导已保留，会在本轮任务结束后自动执行。';
    case 'not-running':
      return '当前没有正在运行的任务，这条引导未能送达。';
    case 'write-failed':
      return '当前任务的输入通道不可写，这条引导未能送达。';
  }
}

/** Which row marker the guidance bubble carries in the transcript, or `null`
 *  when the bubble should not be created at all (nothing happened yet). */
export function steerBubbleState(delivery: SteerDelivery): 'delivered' | 'failed' | null {
  switch (delivery.kind) {
    case 'delivered':
      return 'delivered';
    case 'not-running':
    case 'write-failed':
      return 'failed';
    case 'unsupported':
      // Not an intervention in the running turn — it becomes the next real
      // turn, so it must not be written as a half-state user bubble now.
      return null;
  }
}
