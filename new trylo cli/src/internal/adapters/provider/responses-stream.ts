import type { ProviderEvent } from "../../ports/provider.js";
import { createResponsesTranslator } from "./responses-translate.js";
import { isDoneFrame, parseSseFrames, type SseFrame } from "./sse.js";

/**
 * Responses SSE body -> ProviderEvent (WP18.2: C68 transport half).
 *
 * The loop mirrors `openai-stream.ts` with one deliberate difference: no
 * finish is held back for trailing usage, because on this wire the usage
 * arrives *inside* `response.completed`, ahead of the finish the translator
 * emits for it. Everything else — `[DONE]` stops, an interrupted body is
 * `after_stream_started` unknown-state, an empty stream is a protocol error —
 * is the same contract, stated once per wire so a drift is a visible diff.
 */
export function translateResponsesBody(
  body: ReadableStream<Uint8Array>,
  signal: AbortSignal,
): AsyncGenerator<ProviderEvent> {
  return decodeResponsesBody(body, signal);
}

async function* decodeResponsesBody(
  body: ReadableStream<Uint8Array>,
  signal: AbortSignal,
): AsyncGenerator<ProviderEvent> {
  const translator = createResponsesTranslator();
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let sawAny = false;
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
        for (const event of translateResponsesFrame(translator, frame)) {
          sawAny = true;
          yield event;
        }
      }
    }
  } catch {
    bodyClosed = true;
    // Past headers: an interrupted body is unknown-state, not retryable.
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
  for (const event of translator.complete()) {
    sawAny = true;
    yield event;
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

function translateResponsesFrame(
  translator: ReturnType<typeof createResponsesTranslator>,
  frame: SseFrame,
): ProviderEvent[] {
  try {
    const payload: unknown = JSON.parse(frame.data);
    return translator.push(frame.event, payload);
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
