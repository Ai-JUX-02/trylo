import { cutToBytes } from "../../text-cut.js";
import type { ReadOnlyToolLimits } from "./limits.js";

/** What the caller asked for, and what it means when the arguments are absent. */
export type RangeRequest = {
  /** 0-based first line. Absent means the top of the file. */
  readonly offset: number;
  /** Requested line count. Absent means "as many as the limits allow". */
  readonly limit: number | undefined;
};

/** A request that cannot be honoured, with the reason a model can act on. */
export type RangeProblem = {
  readonly reason: "offset_not_integer" | "offset_negative" | "limit_not_integer" | "limit_not_positive";
  readonly message: string;
};

export type RangeSelection = {
  readonly text: string;
  /** 1-based, inclusive; both zero when no source lines were returned. */
  readonly startLine: number;
  readonly endLine: number;
  readonly totalLines: number;
  /** 0-based offset to pass back for the next chunk; absent when nothing follows. */
  readonly nextOffset: number | undefined;
  /** Set when the file held more than the limits returned. */
  readonly truncated: boolean;
  /** Set when the *requested window* held more lines than the limits returned. */
  readonly truncatedLines: boolean;
  readonly truncatedBytes: boolean;
  /**
   * The one line that cannot fit the byte budget by itself. Present instead of a
   * `nextOffset` because a `nextOffset` into the middle of a line would invite a
   * model to spend turns making no progress. `bytes` is the line's real length,
   * so a model can tell "this file has one enormous line" from "the cut landed
   * awkwardly".
   */
  readonly lineTooLong?: { readonly line: number; readonly bytes: number };
};

/**
 * One line and the terminator that followed it.
 *
 * The terminator is carried per line rather than assumed, because a file edited
 * on two machines can hold both `"\n"` and `"\r\n"`, and a range read has to give
 * back exactly the bytes that were there. Assuming one style would silently
 * rewrite every line of the other kind.
 */
type SourceLine = {
  readonly text: string;
  /** `"\r\n"`, `"\n"`, or `""` for a last line that ends the file. */
  readonly terminator: string;
};

/** Bytes a line occupies in the file, terminator included. */
function lineBytes(line: SourceLine): number {
  return Buffer.byteLength(`${line.text}${line.terminator}`, "utf8");
}

function splitLines(text: string): ReadonlyArray<SourceLine> {
  if (text.length === 0) {
    return [];
  }
  const lines: SourceLine[] = [];
  let cursor = 0;
  for (;;) {
    const newline = text.indexOf("\n", cursor);
    if (newline === -1) {
      lines.push({ text: text.slice(cursor), terminator: "" });
      return lines;
    }
    const hasCarriageReturn = newline > cursor && text.charCodeAt(newline - 1) === 13;
    lines.push({
      text: text.slice(cursor, hasCarriageReturn ? newline - 1 : newline),
      terminator: hasCarriageReturn ? "\r\n" : "\n",
    });
    cursor = newline + 1;
    if (cursor === text.length) {
      // A trailing newline is a terminator, not the start of an empty last line.
      return lines;
    }
  }
}

/**
 * Parse `offset` / `limit` out of raw tool arguments.
 *
 * Absent means "not specified", and that is different from zero — an absent
 * `limit` means the existing ceiling, while `limit: 0` is a request for nothing
 * and is refused, because a model that asked for zero lines has made a mistake
 * worth telling it about rather than a startle.
 */
export function readRangeRequest(args: Readonly<Record<string, unknown>>): RangeRequest | RangeProblem {
  const rawOffset = args["offset"];
  let offset = 0;
  if (rawOffset !== undefined && rawOffset !== null) {
    if (typeof rawOffset !== "number" || !Number.isInteger(rawOffset)) {
      return { reason: "offset_not_integer", message: "offset must be an integer line number, 0-based" };
    }
    if (rawOffset < 0) {
      return { reason: "offset_negative", message: `offset must be 0 or greater, got ${rawOffset}` };
    }
    offset = rawOffset;
  }
  const rawLimit = args["limit"];
  if (rawLimit === undefined || rawLimit === null) {
    return { offset, limit: undefined };
  }
  if (typeof rawLimit !== "number" || !Number.isInteger(rawLimit)) {
    return { reason: "limit_not_integer", message: "limit must be an integer line count" };
  }
  if (rawLimit <= 0) {
    return { reason: "limit_not_positive", message: `limit must be 1 or more, got ${rawLimit}` };
  }
  return { offset, limit: rawLimit };
}

export function isRangeProblem(value: RangeRequest | RangeProblem): value is RangeProblem {
  return "reason" in value;
}

/** Complete-line pagination; only an oversized single line is returned as an explicit prefix. */
export function selectRange(text: string, request: RangeRequest, limits: ReadOnlyToolLimits): RangeSelection {
  const lines = splitLines(text);
  if (request.offset >= lines.length) {
    return { text: "", startLine: 0, endLine: 0, totalLines: lines.length, nextOffset: undefined,
      truncated: false, truncatedLines: false, truncatedBytes: false };
  }
  const count = Math.min(request.limit ?? limits.maxLines, limits.maxLines, lines.length - request.offset);
  const window = lines.slice(request.offset, request.offset + count);
  const joined = window.map(line => line.text + line.terminator).join("");
  if (Buffer.byteLength(joined, "utf8") > limits.maxBytes) {
    return selectByteWindow(lines, joined, request.offset, limits.maxBytes);
  }
  const next = request.offset + count;
  const more = next < lines.length;
  return { text: joined, startLine: request.offset + 1, endLine: next, totalLines: lines.length,
    nextOffset: more ? next : undefined, truncated: more, truncatedLines: more, truncatedBytes: false };
}

function selectByteWindow(lines: ReadonlyArray<SourceLine>, joined: string, start: number, maxBytes: number): RangeSelection {
  const prefix = cutToBytes(joined, maxBytes);
  const kept = splitLines(prefix);
  const complete = prefix.endsWith("\n") ? kept : kept.slice(0, -1);
  const next = start + complete.length;
  const stranded = lines[next];
  const oversized = !prefix.endsWith("\n") && stranded !== undefined && lineBytes(stranded) > maxBytes;
  const text = oversized ? prefix : complete.map(line => line.text + line.terminator).join("");
  const more = next < lines.length;
  return { text, startLine: text.length === 0 ? 0 : start + 1,
    endLine: text.length === 0 ? 0 : next + (oversized ? 1 : 0), totalLines: lines.length,
    nextOffset: more && !oversized && next > start ? next : undefined,
    truncated: more, truncatedLines: false, truncatedBytes: more,
    ...(oversized && stranded !== undefined ? { lineTooLong: { line: next + 1, bytes: lineBytes(stranded) } } : {}),
  };
}
