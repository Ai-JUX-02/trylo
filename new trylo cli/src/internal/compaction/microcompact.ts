import type { TranscriptItem } from "../protocol/transcript.js";

/**
 * Tool-result microcompact (WP09.1 / L36): the read-time elision of oversized
 * tool outputs.
 *
 * A full compaction window is the wrong tool for one giant result. The
 * port's `projectForPrompt` runs this before handing the view out, so the
 * model never sees a payload that would eat the context budget on its own —
 * and never loses the *pair*: the stub is the same `tool_result` item, with
 * the same `toolCallId`, `name` and outcome, so the tool call it answers
 * stays answered. The journal is untouched; a stub is a view fact, not a
 * rewritten record.
 *
 * The newest tool result in the view is never elided: it is the outcome the
 * model just asked for, and eliding it would leave the model acting on a
 * result it cannot read. Older oversized ones keep a bounded head and tail —
 * usually the part that matters — with the elided size stated in the middle.
 */

/** One tool result at or under this size reaches the model whole. */
export const MICROCOMPACT_TOOL_RESULT_MAX_CHARS = 20_000;

/** How much of an oversized result's head survives, in characters. */
const STUB_HEAD_CHARS = 400;
/** How much of an oversized result's tail survives, in characters. */
const STUB_TAIL_CHARS = 200;

export function elideOversizedToolResults(
  items: ReadonlyArray<TranscriptItem>,
): ReadonlyArray<TranscriptItem> {
  // The newest tool result is found from the end, whatever else the view holds.
  let newestIndex = -1;
  for (let index = items.length - 1; index >= 0; index -= 1) {
    const candidate = items[index];
    if (candidate?.kind === "tool_result") {
      newestIndex = index;
      break;
    }
  }
  let changed = false;
  const out = items.map((one, index) => {
    if (index === newestIndex || one.kind !== "tool_result") {
      return one;
    }
    if (one.output.length <= MICROCOMPACT_TOOL_RESULT_MAX_CHARS) {
      return one;
    }
    changed = true;
    return stubOf(one);
  });
  return changed ? out : items;
}

function stubOf(item: TranscriptItem & { kind: "tool_result" }): TranscriptItem {
  const elided = item.output.length - STUB_HEAD_CHARS - STUB_TAIL_CHARS;
  return {
    ...item,
    output: [
      item.output.slice(0, STUB_HEAD_CHARS).trimEnd(),
      `[... elided ${elided} chars of tool output ...]`,
      item.output.slice(item.output.length - STUB_TAIL_CHARS).trimStart(),
    ].join("\n"),
    truncated: true,
  };
}
