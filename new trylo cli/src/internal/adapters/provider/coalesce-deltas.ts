import type { ProviderEvent } from "../../ports/provider.js";

type Delta = Extract<ProviderEvent, { type: "text_delta" | "reasoning_delta" | "tool_input_delta" }>;
const CHUNK_CHARACTERS = 128;
/** Adapter-local boundary; never leaves the adapter as a public event. */
export type CoalesceEvent = ProviderEvent | { readonly type: "flush_deltas" };

/** Wire token boundaries are transport details, not separately retained facts. */
export async function* coalesceDeltas(events: AsyncIterable<CoalesceEvent>): AsyncGenerator<ProviderEvent> {
  let pending: Delta | undefined;
  for await (const event of events) {
    if (event.type === "flush_deltas") {
      if (pending !== undefined) { yield pending; pending = undefined; }
      continue;
    }
    if (event.type !== "text_delta" && event.type !== "reasoning_delta" && event.type !== "tool_input_delta") {
      if (pending !== undefined) { yield pending; pending = undefined; }
      yield event;
      continue;
    }
    if (pending !== undefined && !sameBlock(pending, event)) {
      yield pending;
      pending = undefined;
    }
    pending = pending === undefined ? event : joinDeltas(pending, event);
    const length = pending.type === "tool_input_delta" ? pending.argumentsText.length : pending.text.length;
    if (length >= CHUNK_CHARACTERS) { yield pending; pending = undefined; }
  }
  if (pending !== undefined) yield pending;
}

function sameBlock(left: Delta, right: Delta): boolean {
  if (left.type === "tool_input_delta") return right.type === left.type && left.toolCallId === right.toolCallId;
  if (left.type === "reasoning_delta") return right.type === left.type && left.blockId === right.blockId && left.redacted === right.redacted;
  return right.type === left.type && left.blockId === right.blockId;
}

function joinDeltas(left: Delta, right: Delta): Delta {
  if (left.type === "tool_input_delta" && right.type === left.type) return { ...left, argumentsText: left.argumentsText + right.argumentsText };
  if (left.type === "reasoning_delta" && right.type === left.type) return { ...left, text: left.text + right.text };
  if (left.type === "text_delta" && right.type === left.type) return { ...left, text: left.text + right.text };
  throw new Error("delta blocks must agree before joining");
}
