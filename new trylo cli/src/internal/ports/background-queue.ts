/**
 * Background message queue — messages one session will be given later.
 *
 * This is the durable face of what WP08 already does from inside a turn. The
 * in-turn queue (`domain/input-queue.ts`) hands words to a turn that is running
 * *now* and forgets them once the turn ends. This port holds words across
 * process boundaries: they are written by one process, read by another, and
 * survive both of them exiting.
 *
 * Why the two are not merged: the in-turn queue is addressed to a *turn*
 * (`AddressedUserInput.turnId`), so a message typed for a turn that has already
 * ended is refused. A background message is addressed to a *session* and has no
 * turn to name — it is waiting for one that does not exist yet. Folding them
 * together would give every background message a turn identity it does not have,
 * and the rule that protects a late message would start rejecting messages that
 * are not late at all.
 *
 * The shape is Codex's `ext/queue`: an ordered, per-session list of user
 * messages with a hard ceiling, six verbs (list / enqueue / update / delete /
 * reorder / start), and exactly one writer per session. The single-writer rule
 * is the load-bearing part and is stated as a contract here rather than implied
 * by an implementation: two writers appending to one list is how a message ends
 * up delivered twice or not at all, and neither is visible to the person whose
 * words those were.
 */

export const QUEUE_FORMAT_VERSION = "1";

/**
 * The ceiling on one session's queue.
 *
 * Codex uses 100 (`state/src/lib.rs: MAX_QUEUE_ITEMS`). Each message here buys
 * at least one turn once the session goes idle, so the ceiling is really a
 * ceiling on how much provider spend a person can queue without watching, and
 * past it the honest answer is a refusal the surface can show — not a list that
 * grows in silence.
 */
export const MAX_QUEUED_MESSAGES = 100;

/**
 * One message waiting for its session to go idle.
 *
 * `id` is what every other verb names, so it must be stable across reads: a
 * caller that lists, then deletes by id, must not be deleting a different
 * message than the one it saw. `enqueuedAtMs` is epoch milliseconds, ordered
 * oldest-first, and is the tiebreaker that keeps two messages enqueued in the
 * same millisecond in the order they arrived.
 */
export type QueuedMessage = {
  readonly id: string;
  readonly text: string;
  readonly enqueuedAtMs: number;
};

/**
 * A page of the queue, plus enough information to page through the rest.
 *
 * Codex lists a page rather than everything (`list_page`) because a queue can
 * hold 100 messages of unbounded length; `total` is what lets a surface say
 * "showing 20 of 63" instead of implying 20 is all of it.
 */
export type QueuePage = {
  readonly items: ReadonlyArray<QueuedMessage>;
  readonly total: number;
};

/**
 * Why a queue operation was refused.
 *
 * Every refusal here is something the person can act on, which is why none of
 * them are silently swallowed: `full` has a remedy (send now, or delete
 * something), `unknown_item` has a remedy (list again), and the rest mean the
 * queue could not be read or written — a state that must never be reported as
 * an empty queue, because "nothing queued" and "could not read the queue" lead
 * the person to opposite conclusions.
 */
export type QueueFailureCode =
  /** Nothing but whitespace: there is no message to queue. */
  | "blank"
  /** The ceiling is standing. */
  | "full"
  /** No such queued message, or it belongs to another session's queue. */
  | "unknown_item"
  /** A reorder that is not a permutation of the whole queue. */
  | "order_not_a_permutation"
  /** The queue could not be read. */
  | "queue_unreadable"
  /** The queue could not be written. */
  | "queue_unwritable"
  /** Another writer holds this session's queue. */
  | "queue_locked";

/**
 * The failure branch on its own.
 *
 * Named because `QueueResult<T>["code"]` does not exist: `T` is unconstrained, so
 * indexing the union for `code` is a type error rather than a narrowing, and
 * every caller that wants just the code has to invent its own local alias. This
 * is that alias, and it is what lets `domain/background-queue.ts` read a refusal
 * without knowing what a success looks like.
 */
export type QueueRefusal = { readonly ok: false; readonly code: QueueFailureCode };

export type QueueResult<T> = { readonly ok: true; readonly value: T } | QueueRefusal;

/**
 * What an adapter is given and what it must keep.
 *
 * A session id, a now, and an id factory — nothing ambient. In particular no
 * clock and no randomness are read by the implementations behind this port, so
 * a test can say exactly which message is which without waiting or mocking.
 */
export type QueueClock = {
  readonly now: () => number;
  readonly newId: (prefix: string) => string;
};

/**
 * The durable queue contract.
 *
 * Implementations are process-safe: concurrent calls from two processes must
 * behave as if they arrived one after the other, which is what `enqueue`'s and
 * `reorder`'s atomicity requirement means in practice. `released` is the only
 * way a caller gives the lock back, and a caller that forgets it has merely
 * delayed the next writer — the contract says nothing can be read or written in
 * the meantime, so a forgotten lock is a denial of service, never a corruption.
 */
export type BackgroundQueue = {
  /**
   * Everything waiting, oldest first. `offset` and `limit` page it; `limit` of
   * 0 is refused by the adapter rather than read as "everything".
   */
  readonly list: (offset: number, limit: number) => Promise<QueueResult<QueuePage>>;
  /** Adds one message to the tail. */
  readonly enqueue: (text: string) => Promise<QueueResult<QueuedMessage>>;
  /**
   * Put a message back **under its own id and `enqueuedAtMs`**, at the tail.
   *
   * The worker needs this because its durable handoff record is keyed by the
   * original message id: a restore that mints a new id produces a message that
   * looks unrecorded, and "never auto-retry a job whose outcome is unknown" stops
   * holding without anything failing loudly. Re-presenting an id already in the
   * queue is a no-op that reports the existing entry.
   */
  readonly requeue: (message: QueuedMessage) => Promise<QueueResult<QueuedMessage>>;
  /** Replaces one message's text, keeping its place in the order. */
  readonly update: (id: string, text: string) => Promise<QueueResult<QueuedMessage>>;
  /** Removes one message. Absent is reported as `unknown_item`. */
  readonly delete: (id: string) => Promise<QueueResult<boolean>>;
  /**
   * Replaces the whole order. Every current id must appear exactly once — a
   * partial list is refused with `order_not_a_permutation` rather than applied,
   * because a reorder that quietly dropped two messages would delete them
   * without anyone asking.
   */
  readonly reorder: (orderedIds: ReadonlyArray<string>) => Promise<QueueResult<boolean>>;
  /** Gives the single-writer lock back. */
  readonly release: () => Promise<void>;
};
