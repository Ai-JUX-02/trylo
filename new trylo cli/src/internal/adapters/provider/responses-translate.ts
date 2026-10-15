import type { ProviderEvent, ProviderFinishReason } from "../../ports/provider.js";
import { parseToolInput } from "./invalid-tool-input.js";
import { createResponsesSummary } from "./responses-summary.js";

/**
 * Responses wire event -> ProviderEvent translation (WP18.2: C68).
 *
 * Reuse: Codex is Responses-only on the wire
 * (`model-provider-info/src/lib.rs:68 WireApi::Responses`, `:61` chat
 * explicitly rejected), so this file ports the event families Codex consumes
 * (`response.output_text.delta`, `response.function_call_arguments.delta`,
 * `response.completed/failed`, usage on the completed response) into the
 * canonical port. Structure mirrors `openai-translate.ts`: one function per
 * wire family, pure apart from the open-block assembly it owns.
 *
 * Block discipline matches the chat translator on purpose: text blocks are
 * `text-{output_index}`, reasoning blocks `reasoning-{output_index}`, and tool
 * calls assemble by `item_id`. A consumer reading both wires sees one shape.
 */

type ResponsesToolAssembly = {
  callId: string;
  name: string;
  text: string;
};

type ResponsesState = {
  readonly textBlocks: Map<string, string>;
  readonly summary: ReturnType<typeof createResponsesSummary>;
  readonly tools: Map<string, ResponsesToolAssembly>;
  toolCallsEmitted: number;
  /** A terminal frame was already emitted; `complete()` must not invent one. */
  finished: boolean;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function str(record: Record<string, unknown>, key: string): string {
  const value = record[key];
  return typeof value === "string" ? value : "";
}

function num(record: Record<string, unknown>, key: string): number {
  const value = record[key];
  return typeof value === "number" ? value : 0;
}

export function createResponsesTranslator() {
  const state: ResponsesState = {
    textBlocks: new Map(),
    summary: createResponsesSummary(),
    tools: new Map(),
    toolCallsEmitted: 0,
    finished: false,
  };
  return {
    push(event: string, payload: unknown): ProviderEvent[] {
      return pushResponsesEvent(state, event, payload);
    },
    /**
     * The stream ended without a terminal frame: close what is open and
     * finish explicitly. After a terminal frame this is silent — the blocks
     * are already closed and a second finish would be invented output.
     */
    complete(): ProviderEvent[] {
      if (state.finished) {
        return [];
      }
      return completeResponsesStream(state, "other", "incomplete_stream");
    },
  };
}

function pushResponsesEvent(
  state: ResponsesState,
  event: string,
  payload: unknown,
): ProviderEvent[] {
  // Nothing after a terminal frame may be treated as model output — the same
  // rule `loop/stream.ts` enforces one layer up, stated here too so a
  // misbehaving endpoint cannot reopen a settled stream.
  if (state.finished) {
    return [];
  }
  if (!isRecord(payload)) {
    return [];
  }
  switch (event) {
    case "response.output_text.delta":
      return textDelta(state, payload);
    case "response.reasoning_summary_text.delta":
      return state.summary.delta(payload);
    case "response.reasoning_summary_text.done":
      return state.summary.textDone(payload);
    case "response.reasoning_summary_part.done":
      return state.summary.partDone(payload);
    case "response.function_call_arguments.delta":
      return toolArgumentsDelta(state, payload);
    case "response.output_item.done":
      return outputItemDone(state, payload);
    case "response.completed":
      return completed(state, payload);
    case "response.failed":
      state.finished = true;
      return [
        {
          type: "error",
          class: "server",
          retryable: false,
          phase: "after_stream_started",
          message: str(payload, "message").length > 0 ? str(payload, "message") : "response_failed",
        },
      ];
    case "response.incomplete":
      state.finished = true;
      return completeResponsesStream(state, "length", "response_incomplete");
    case "error":
      state.finished = true;
      return [
        {
          type: "error",
          class: "server",
          retryable: false,
          phase: "after_stream_started",
          message: str(payload, "message").length > 0 ? str(payload, "message") : "response_error",
        },
      ];
    default:
      // Created/progress and per-part frames carry no new output text. The
      // output item's done frame owns block closure across all its parts.
      return [];
  }
}

/** Assistant text deltas, one block per output index. */
function textDelta(state: ResponsesState, payload: Record<string, unknown>): ProviderEvent[] {
  const delta = str(payload, "delta");
  if (delta.length === 0) {
    return [];
  }
  const key = `text-${num(payload, "output_index")}`;
  const events: ProviderEvent[] = [];
  if (!state.textBlocks.has(key)) {
    state.textBlocks.set(key, key);
    events.push({ type: "text_start", blockId: key });
  }
  events.push({ type: "text_delta", blockId: key, text: delta });
  return events;
}

/**
 * Function argument fragments, keyed by the wire's `item_id`.
 *
 * The name may arrive late (in `output_item.done`); the fragment is kept
 * regardless, exactly like the chat translator keeps a pre-name fragment.
 */
function toolArgumentsDelta(state: ResponsesState, payload: Record<string, unknown>): ProviderEvent[] {
  const delta = str(payload, "delta");
  const itemId = str(payload, "item_id");
  if (itemId.length === 0) {
    return [];
  }
  const existing = state.tools.get(itemId);
  if (existing === undefined) {
    state.tools.set(itemId, { callId: itemId, name: "", text: delta });
    const events: ProviderEvent[] = [{ type: "tool_input_start", toolCallId: itemId, name: "" }];
    if (delta.length > 0) {
      events.push({ type: "tool_input_delta", toolCallId: itemId, argumentsText: delta });
    }
    return events;
  }
  existing.text += delta;
  if (delta.length === 0) {
    return [];
  }
  return [{ type: "tool_input_delta", toolCallId: existing.callId, argumentsText: delta }];
}

/**
 * A finished output item: function calls settle here with their full shape.
 * The wire's `call_id` (the `fc_*` id the next request references) replaces
 * the provisional `item_id`, so the settled call points at the id the loop
 * must answer — the same "open id, not fragment id" rule the chat translator
 * documents.
 */
function outputItemDone(state: ResponsesState, payload: Record<string, unknown>): ProviderEvent[] {
  const item = payload["item"];
  if (!isRecord(item)) {
    return [];
  }
  if (item["type"] === "reasoning") return state.summary.itemDone(num(payload, "output_index"), item);
  if (item["type"] === "message") {
    const blockId = `text-${num(payload, "output_index")}`;
    return state.textBlocks.delete(blockId) ? [{ type: "text_end", blockId }] : [];
  }
  if (item["type"] !== "function_call") {
    return [];
  }
  const itemId = str(payload, "item_id").length > 0 ? str(payload, "item_id") : str(item, "id");
  const callId = str(item, "call_id").length > 0 ? str(item, "call_id") : itemId;
  const name = str(item, "name");
  const argsText = str(item, "arguments");
  const assembly = state.tools.get(itemId);
  if (assembly !== undefined) {
    state.tools.delete(itemId);
    if (name.length > 0) {
      assembly.name = name;
    }
    if (argsText.length > 0 && assembly.text.length === 0) {
      assembly.text = argsText;
    }
    assembly.callId = callId;
    return [settleToolCall(state, assembly)];
  }
  return [settleToolCall(state, { callId, name, text: argsText })];
}

/** Settle one assembled call: parsed object or a visible invalid. */
function settleToolCall(state: ResponsesState, assembly: ResponsesToolAssembly): ProviderEvent {
  state.toolCallsEmitted += 1;
  const parsed = parseToolInput(assembly.text);
  if (parsed.ok) {
    return { type: "tool_call", toolCallId: assembly.callId, name: assembly.name, arguments: parsed.arguments };
  }
  return {
    type: "tool_call_invalid",
    toolCallId: assembly.callId,
    name: assembly.name,
    rawArguments: "",
    message: parsed.message,
  };
}

/**
 * The terminal frame: usage first (so a consumer reading to `finish` still
 * sees it), then close what is open, settle every call, then finish.
 */
function completed(state: ResponsesState, payload: Record<string, unknown>): ProviderEvent[] {
  const events: ProviderEvent[] = [];
  const response = payload["response"];
  const detail: Record<string, unknown> = isRecord(response) ? response : payload;
  const usage = usageEvent(detail["usage"]);
  if (usage !== undefined) {
    events.push(usage);
  }
  const status = str(detail, "status");
  state.finished = true;
  if (status === "failed") {
    events.push({
      type: "error",
      class: "server",
      retryable: false,
      phase: "after_stream_started",
      message: "response_failed",
    });
    return events;
  }
  const reason: ProviderFinishReason = status === "incomplete" ? "length" : "stop";
  events.push(...state.summary.completed(detail["output"]));
  events.push(...closeOpenResponsesBlocks(state));
  events.push(...settleAllTools(state));
  events.push({
    type: "finish",
    reason,
    rawReason: status.length > 0 ? status : "completed",
    requiresFollowUp: state.toolCallsEmitted > 0,
  });
  return events;
}

/** Usage on the completed response; absent usage yields nothing. */
function usageEvent(usage: unknown): ProviderEvent | undefined {
  if (!isRecord(usage)) {
    return undefined;
  }
  const input = num(usage, "input_tokens");
  const output = num(usage, "output_tokens");
  const total = num(usage, "total_tokens");
  if (input === 0 && output === 0 && total === 0) {
    return undefined;
  }
  return {
    type: "usage",
    usage: {
      mode: "snapshot",
      inputTokens: input,
      outputTokens: output,
      cacheReadTokens: 0,
      cacheWriteTokens: 0,
      reasoningTokens: 0,
      totalTokens: total,
    },
  };
}

function closeOpenResponsesBlocks(state: ResponsesState): ProviderEvent[] {
  const events: ProviderEvent[] = [];
  for (const blockId of [...state.textBlocks.keys()].sort()) {
    events.push({ type: "text_end", blockId });
    state.textBlocks.delete(blockId);
  }
  events.push(...state.summary.closeAll());
  return events;
}

function settleAllTools(state: ResponsesState): ProviderEvent[] {
  const events: ProviderEvent[] = [];
  for (const [itemId, assembly] of [...state.tools.entries()].sort((a, b) => (a[0] < b[0] ? -1 : 1))) {
    state.tools.delete(itemId);
    events.push(settleToolCall(state, assembly));
  }
  return events;
}

/** The stream ended with no `response.completed`: close and finish. */
function completeResponsesStream(
  state: ResponsesState,
  reason: ProviderFinishReason,
  rawReason: string,
): ProviderEvent[] {
  const events = closeOpenResponsesBlocks(state);
  events.push(...settleAllTools(state));
  events.push({ type: "finish", reason, rawReason, requiresFollowUp: state.toolCallsEmitted > 0 });
  return events;
}
