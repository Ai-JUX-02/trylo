import type { ProviderEvent } from "../../ports/provider.js";
import { coalesceDeltas, type CoalesceEvent } from "./coalesce-deltas.js";
import { createOpenAiTranslator } from "./openai-translate.js";
import { isDoneFrame, parseSseFrames, type SseFrame } from "./sse.js";

/** Coalesce wire fragments without changing text, arguments, or block ordering. */
export function translateBody(body: ReadableStream<Uint8Array>, signal: AbortSignal): AsyncGenerator<ProviderEvent> {
  return coalesceDeltas(decodeBody(body, signal));
}

/** Hold finish for trailing usage, stop at [DONE], and release the HTTP reader. */
async function* decodeBody(
  body: ReadableStream<Uint8Array>,
  signal: AbortSignal,
): AsyncGenerator<CoalesceEvent> {
  const translator = createOpenAiTranslator();
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let sawAny = false;
  let heldFinish: ProviderEvent | undefined;
  let bodyClosed = false;
  try {
    stream: for (;;) {
      const step = await reader.read();
      if (step.done === true) {
        bodyClosed = true;
        break;
      }
      const text = decoder.decode(step.value, { stream: true });
      const parsed = parseSseFrames(text, buffer);
      buffer = parsed.buffer;
      for (const frame of parsed.frames) {
        if (isDoneFrame(frame)) {
          break stream;
        }
        for (const event of translateFrame(translator, frame)) {
          if (event.type === "finish" && heldFinish === undefined) {
            heldFinish = event;
            sawAny = true;
            continue;
          }
          if (heldFinish !== undefined && event.type !== "usage") {
            continue;
          }
          sawAny = true;
          yield event;
        }
      }
      // Chunk boundaries are not semantic flush points. The coalescer delivers
      // the first delta immediately, then bounds later fragments by content.
    }
  } catch {
    bodyClosed = true;
    // Past headers: an interrupted body is unknown-state, not retryable.
    // A finish that already arrived still counts — the provider did conclude.
    if (heldFinish !== undefined) {
      yield heldFinish;
    }
    yield {
      type: "error",
      class: signal.aborted ? "cancelled" : "network",
      retryable: false,
      phase: "after_stream_started",
      message: signal.aborted ? "cancelled" : "stream_interrupted",
    };
    return;
  } finally {
    try {
      if (!bodyClosed) await reader.cancel();
    } finally {
      reader.releaseLock();
    }
  }
  if (heldFinish === undefined) {
    for (const event of translator.complete()) {
      sawAny = true;
      yield event;
    }
  } else {
    // The finish already closed everything the translator tracks, so there
    // is nothing left for complete() to settle — emitting it would only
    // invent block closures the loop never saw open.
    yield heldFinish;
  }
  if (!sawAny) {
    yield {
      type: "error",
      class: "protocol",
      retryable: false,
      phase: "after_stream_started",
      message: "empty_stream",
    };
  }
}

function translateFrame(
  translator: ReturnType<typeof createOpenAiTranslator>,
  frame: SseFrame,
): ProviderEvent[] {
  try {
    const payload: unknown = JSON.parse(frame.data);
    return translator.push(payload);
  } catch {
    return [
      {
        type: "raw_unknown",
        wire: "sse.unparseable",
        metadata: { bytes: frame.data.length },
      },
    ];
  }
}

