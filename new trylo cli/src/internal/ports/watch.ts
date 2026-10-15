import type { JsonObject } from "../protocol/envelope.js";
import type { WatchCondition, WatchState } from "../domain/watch.js";
import type { Occurrence } from "./schedule.js";

/**
 * Watching for a condition and sleeping until one happens (WP26 / A07).
 *
 * ## Why this is a port and not two features
 *
 * "Remind me when the build finishes" and "check back in twenty minutes" are one
 * capability with two ways to name the moment: a **condition** you wait for, or a
 * **deadline** you wait until. Modelling them separately would produce two
 * cancellation paths, two records, and two ways for the same work to fire twice.
 *
 * So both are watches. A deadline is the degenerate case where the probe always
 * answers "met" once the time has passed — which is exactly what it is, and
 * reusing the shape means `cancel`, `list` and deduplication are written once.
 *
 * ## What the caller does not do here
 *
 * A watch never runs work, never opens a process, and never talks to a provider.
 * It hands the caller an occurrence and the queue is what delivers — the same
 * division the schedule port draws, because a watcher that enqueued its own
 * message would be the second delivery path ADR §5 rules out.
 */
export type WatchId = string;

/** What kind of moment a watch is waiting for. */
export type WatchTrigger =
  /** Wait until a condition is true. The interesting one. */
  | { readonly kind: "condition"; readonly condition: WatchCondition }
  /** Wait until a wall-clock moment. A condition that becomes true on its own. */
  | { readonly kind: "deadline"; readonly atMs: number };

export type WatchRow = {
  readonly id: WatchId;
  readonly trigger: WatchTrigger;
  readonly state: WatchState;
  /**
   * The message that will be handed to the session when it fires. Frozen at
   * creation: editing what a watch says must not change what an already-armed
   * watch will announce.
   */
  readonly text: string;
  /** Where the message goes. A watch for a session that has gone is not useful. */
  readonly sessionId: string;
  readonly createdAtMs: number;
  /**
   * Why the condition was met, written when it fired.
   *
   * On the row rather than in the message: a fire an hour later is only
   * intelligible if it says what it saw, and a caller holding just the message
   * would have to re-derive it.
   */
  readonly firedBecause?: string;
};

/** Why a watch operation was refused. */
export type WatchFailureCode =
  | "watch_not_found"
  | "already_fired"
  | "already_cancelled"
  | "not_terminal"
  | "not_a_session"
  | "blank_text"
  | "invalid_deadline"
  | "watch_unwritable"
  | "too_many_watches";

export type WatchRefusal = {
  readonly ok: false;
  readonly code: WatchFailureCode;
  readonly message: string;
};

export type WatchResult<T> = { readonly ok: true; readonly value: T } | WatchRefusal;

/**
 * How many watches one session may hold at once.
 *
 * A watch costs a scheduled occurrence and a poll, and a person who has armed
 * forty of them is not going to read forty notifications. Refusing at creation
 * is kinder than firing forty and having them cancel thirty-eight.
 */
export const MAX_WATCHES_PER_SESSION = 20;

export type WatchClock = {
  readonly now: () => number;
  readonly newWatchId: () => string;
};

/**
 * The durable watch contract.
 *
 * `settled` is exposed on purpose. Deduplication is the whole reason a watch
 * record has to be readable, and a caller that cannot see which occurrences are
 * already settled will fire the same one twice.
 *
 * `evaluate` is separated from `fire` so the decision "is it met" and the action
 * "tell the session" are separately testable — and, more importantly, so a caller
 * can evaluate without being able to enqueue, which is what makes a dry run of a
 * watcher possible.
 */
export type WatchPort = {
  /** Every watch for one session, or for all of them when absent. */
  readonly list: (sessionId?: string) => Promise<WatchResult<ReadonlyArray<WatchRow>>>;
  /** Arm one. It does not fire until something asks. */
  readonly create: (input: {
    readonly trigger: WatchTrigger;
    readonly text: string;
    readonly sessionId: string;
  }) => Promise<WatchResult<WatchRow>>;
  /**
   * Arm one that fires immediately if the condition is already true.
   *
   * The reuse case — "if the build is already done, don't wait" — and the reason
   * `evaluate` is asked at all. A watcher that only checked later would make
   * someone wait for something that already happened.
   */
  readonly createOrFire: (
    input: { readonly trigger: WatchTrigger; readonly text: string; readonly sessionId: string },
  ) => Promise<WatchResult<{ readonly row: WatchRow; readonly fired: boolean; readonly messageId?: string }>>;
  /** Stop an armed watch. Refused once it has fired — see the port's notes. */
  readonly cancel: (watchId: WatchId) => Promise<WatchResult<WatchState>>;
  /** Is the condition true right now? Says which thing it saw. */
  readonly evaluate: (watchId: WatchId) => Promise<WatchResult<{ readonly met: boolean; readonly because?: string }>>;
  /**
   * Settle a watch that has fired, recording the occurrence.
   *
   * Idempotent by occurrence id: settling the same occurrence twice records once.
   * That is what makes "fires once" a property of the record rather than a
   * promise about a loop.
   */
  readonly fire: (
    watchId: WatchId,
    fireAtMs: number,
    messageId: string,
  ) => Promise<WatchResult<WatchState>>;
  /** The occurrences already settled for a watch, so a caller can check. */
  readonly settled: (watchId: WatchId) => Promise<WatchResult<ReadonlyArray<Occurrence>>>;
  /** Drop a terminal watch's record. Never touches an armed one. */
  readonly forget: (watchId: WatchId) => Promise<WatchResult<boolean>>;
};

/**
 * A watch rendered for a person.
 *
 * Kept as a type so a surface and the durable store agree on what "one watch"
 * means; the words live in `domain/watch.ts` beside the state machine.
 */
export type WatchDescription = {
  readonly headline: string;
  readonly detail: JsonObject;
};
