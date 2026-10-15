import { randomBytes } from "node:crypto";
import { isProcessSessionIdShape } from "../../ports/process-session.js";

export { isProcessSessionIdShape };

/**
 * Session identity.
 *
 * Ids come from `randomBytes`, not a counter, because a counter leaks how many
 * commands have run and lets a caller guess a live session's id. These ids are
 * handed to a model, so guessing one must be as hard as guessing a token.
 *
 * The prefix is part of the contract: a session id that turns up in a log line
 * is recognisable as a session id, which is the difference between a readable
 * log and a puzzle.
 */

export function newProcessSessionId(): string {
  return `ps_${randomBytes(12).toString("hex")}`;
}

/**
 * Ids are checked before they are looked up. This is not paranoia about the
 * model — it is about the shape of the failure: an id that did not come from
 * this function cannot address a session, and saying so plainly is better than
 * a lookup that quietly misses. The shape itself is the port's (`PROCESS_SESSION_ID_SHAPE`),
 * re-exported here so existing callers keep working.
 */
