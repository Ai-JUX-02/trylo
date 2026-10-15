import type { Transcript } from "../../protocol/transcript.js";
import { unansweredCallIndexes } from "../../protocol/tool-pairing.js";

/**
 * Read-time cleanup of tool requests the tool never answered (WP §3).
 *
 * A crash between a `tool_call` and its `tool_result` leaves the journal holding
 * a request with no answer. Replaying it would ask the model to react to a tool
 * call it already made and never heard back from, and many providers refuse such
 * a message outright. The goose rule (D4 §3) is *repair the conversation, do not
 * invent results*: the unsettled request is dropped, and nothing is synthesised
 * in its place — no "tool cancelled" result, no placeholder.
 *
 * Deliberate boundaries:
 *
 *  - **A result of any outcome settles its call.** `cancelled`, `failed` and
 *    `unknown` are things that really happened, so they stay; only a call with
 *    *no* result item at all is torn.
 *  - **The journal is not touched.** This is a projection over the records, not
 *    a repair: the caller that owns bytes is `repairTornTail`, and it has its
 *    own, much narrower rule.
 *  - **Position does not matter.** A settled conversation never contains a call
 *    without an answer, so wherever one appears it is torn, and dropping it
 *    cannot misinterpret an honest history.
 *
 * # Why the decision now lives elsewhere
 *
 * This used to carry its own copy of the pairing rule, and `loop/**` carried a
 * *different* one — see `protocol/tool-pairing.ts` for why the two disagreed
 * and which one survived. The rule itself is unchanged here (that is what
 * `durable-ordinals.test.ts` pins); only its single owner moved, so that the
 * loop and this projection can no longer drift apart. These two functions stay
 * exported from here because `surface/cli/turn-threading.ts` and
 * `session-store/ndjson.ts` call them from this path.
 */

/** True when every `tool_call` in the transcript has a matching `tool_result`. */
export function allToolCallsSettled(transcript: Transcript): boolean {
  return unansweredCallIndexes(transcript).size === 0;
}

/**
 * The transcript with every unanswered tool request removed.
 *
 * Returns the input unchanged when nothing is torn, so the common resume path
 * keeps its identity and no caller can observe an accidental copy.
 */
export function purgeUnsettledToolCalls(transcript: Transcript): Transcript {
  const torn = unansweredCallIndexes(transcript);
  if (torn.size === 0) {
    return transcript;
  }
  return transcript.filter((_item, index) => !torn.has(index));
}
