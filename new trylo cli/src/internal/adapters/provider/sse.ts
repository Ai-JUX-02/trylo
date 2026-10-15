/**
 * Minimal SSE framing for OpenAI-compatible chat completion streams.
 * Pure: no IO, no clock. Kept separate so framing can be tested without a
 * network, a server or a timer.
 */

export type SseFrame = {
  readonly event: string;
  readonly data: string;
};

export type SseParseResult = {
  readonly frames: ReadonlyArray<SseFrame>;
  /** Bytes that may belong to a frame not fully received yet. */
  readonly buffer: string;
};

const TERMINATORS = ["\n\n", "\r\n\r\n"];

export function parseSseFrames(chunk: string, buffer: string): SseParseResult {
  const text = buffer + chunk;
  const frames: SseFrame[] = [];
  let rest = text;
  for (;;) {
    let cut = -1;
    let cutLength = 2;
    for (const terminator of TERMINATORS) {
      const index = rest.indexOf(terminator);
      if (index !== -1 && (cut === -1 || index < cut)) {
        cut = index;
        cutLength = terminator.length;
      }
    }
    if (cut === -1) {
      break;
    }
    const block = rest.slice(0, cut);
    rest = rest.slice(cut + cutLength);
    let event = "message";
    const dataLines: string[] = [];
    for (const rawLine of block.split(/\r?\n/)) {
      if (rawLine.startsWith(":")) {
        continue;
      }
      const separator = rawLine.indexOf(":");
      if (separator === -1) {
        continue;
      }
      const field = rawLine.slice(0, separator);
      let value = rawLine.slice(separator + 1);
      if (value.startsWith(" ")) {
        value = value.slice(1);
      }
      if (field === "event") {
        event = value;
      } else if (field === "data") {
        dataLines.push(value);
      }
    }
    if (dataLines.length > 0) {
      frames.push({ event, data: dataLines.join("\n") });
    }
  }
  return { frames, buffer: rest };
}

export function isDoneFrame(frame: SseFrame): boolean {
  return frame.data.trim() === "[DONE]";
}
