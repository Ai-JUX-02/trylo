// Trylo Desktop — literal <think> / </think> scrubbing for streamed text.
//
// Round-3 P2. Some OpenAI-compatible endpoints (observed: AMD's
// `DeepSeek-V4-Flash-Vision-Exp` via ark/radeon) return the model's chain of
// thought INSIDE `delta.content` instead of `delta.reasoning_content`. The
// wire therefore carries the tag as plain text and the desktop renders it:
//
//   …Let me run it.</think>Let me execute the helper that writes RESULT.md…
//
// Ground truth from the acceptance run (leveldb `001985.log`, session
// `code-musy5wnw-sz4xu`): 2 persisted `text` records contain a literal
// `</think>`, while `<think>` never appears anywhere on disk, and the run
// persisted 78 `text` / 0 `thinking` messages. So the OPEN tag is not reaching
// us in that shape — but the CLOSE tag is, and the reasoning prose before it
// is already indistinguishable from the answer.
//
// The contract is therefore deliberately narrow: this is a TAG scrubber, not a
// reasoning classifier. It removes the literal tag text and nothing else. It
// does NOT try to guess which prose was "thinking" — that judgement needs the
// open tag, and inventing it would delete real answers.
//
// Streaming discipline: tags straddle delta boundaries in practice (`<thi` +
// `nk>`), so the scrubber is a small stateful object, not a `String.replace`.
// Callers own the accumulated buffer; this owns only the tag state.

/** Longest tag either side; anything shorter can't yet be a complete tag. */
const MAX_TAG_LEN = '</think>'.length;

const OPEN_TAG = '<think>';
const CLOSE_TAG = '</think>';
/** Both tags, for tail inspection outside a think block. */
const TAGS: readonly string[] = [OPEN_TAG, CLOSE_TAG];

export interface ThinkScrubResult {
  /** Text to append to the visible buffer. */
  readonly text: string;
  /** True when this chunk left a partial tag pending (caller must not flush). */
  readonly pending: boolean;
}

/**
 * Stateful scrubber for one message's text stream.
 *
 * One instance per message (`message_start` → `message_end` in the v1 adapter,
 * `content_block_start` → `content_block_stop` in the legacy translator). Reuse
 * across messages would leak an unclosed `<think>` into the next bubble.
 */
export class ThinkScrubber {
  /** True while between `<think>` and `</think>`. Content is still kept —
   *  see the file header: we scrub tags, we do not classify reasoning. */
  private inThink = false;
  /** Trailing fragment that may be the head of a tag, e.g. `<thi`. */
  private carry = '';

  /**
   * Scrub one streamed chunk.
   *
   * A tag split across chunks is held back in `carry` until the next chunk
   * completes it; if the stream ends while a fragment is pending, `flush()`
   * returns it — dropping it is the lesser evil versus printing a bare `<thi`
   * into the transcript.
   */
  push(chunk: string): ThinkScrubResult {
    const input = this.carry + chunk;
    this.carry = '';
    let out = '';
    let i = 0;
    while (i < input.length) {
      if (this.inThink) {
        const close = input.indexOf(CLOSE_TAG, i);
        if (close === -1) {
          // Keep the tail that could be a partial close tag.
          const keepFrom = partialTagStart(input, i, CLOSE_TAG);
          this.carry = keepFrom === -1 ? '' : input.slice(keepFrom);
          i = input.length;
          break;
        }
        // Reasoning text between the tags is dropped: the desktop has a
        // dedicated `thinking` channel, and prose that arrived on the text
        // channel was never going to be rendered as an answer.
        i = close + CLOSE_TAG.length;
        this.inThink = false;
        continue;
      }
      const open = input.indexOf(OPEN_TAG, i);
      if (open === -1) {
        const close = input.indexOf(CLOSE_TAG, i);
        if (close !== -1) {
          // A close tag with no open tag: the reasoning already went down the
          // reasoning channel (or the provider stripped the open tag). Emit
          // the prose, drop the tag.
          out += input.slice(i, close);
          i = close + CLOSE_TAG.length;
          continue;
        }
        const keepFrom = partialTagStartAny(input, i, TAGS);
        const end = keepFrom === -1 ? input.length : keepFrom;
        out += input.slice(i, end);
        this.carry = end === input.length ? '' : input.slice(end);
        i = input.length;
        break;
      }
      out += input.slice(i, open);
      i = open + OPEN_TAG.length;
      this.inThink = true;
    }
    return { text: out, pending: this.carry !== '' };
  }

  /** Whatever is left when the message ends. A pending partial tag is dropped. */
  flush(): string {
    const rest = this.carry;
    this.carry = '';
    return rest.startsWith('<') ? '' : rest;
  }
}

/**
 * Index from which the tail of `input` might be the head of `tag`, or -1.
 *
 * Only worth holding back the longest possible partial (`<`, `<t`, … up to the
 * full tag length); holding back more would stall ordinary prose that merely
 * ends in a `<`.
 */
function partialTagStart(input: string, from: number, tag: string): number {
  const maxFrom = Math.max(from, input.length - (tag.length - 1));
  for (let start = maxFrom; start < input.length; start++) {
    if (tag.startsWith(input.slice(start))) return start;
  }
  return -1;
}

/**
 * Same, but for either tag. Outside a think block both `<think>` and
 * `</think>` can begin in the tail, and a split `</thi` + `nk>` is a close tag
 * — checking only the open tag would flush `x</thi` into the transcript and
 * leave a bare `</think>` for the next chunk.
 */
function partialTagStartAny(input: string, from: number, tags: readonly string[]): number {
  const maxFrom = Math.max(from, input.length - (MAX_TAG_LEN - 1));
  for (let start = maxFrom; start < input.length; start++) {
    const tail = input.slice(start);
    if (tags.some((tag) => tag.startsWith(tail))) return start;
  }
  return -1;
}

/** One-shot scrub for text that is already whole (tests, replay, history). */
export function scrubThinkTags(text: string): string {
  const scrubber = new ThinkScrubber();
  return scrubber.push(text).text + scrubber.flush();
}
