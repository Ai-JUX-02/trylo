import { providerContinuationScope, type ProviderContinuationPort, type ProviderEvent, type ProviderMessage, type ProviderRequest } from "../../ports/provider.js";
import type { JsonObject } from "../../protocol/envelope.js";
import { glmCheckpoint, glmContinuationBinding, MAX_REASONING_CHARS, readGlmCheckpoint, type NativeAssistant } from "./glm-continuation-checkpoint.js";
import { createGlmContinuationCache } from "./glm-continuation-cache.js";

export type GlmToolContinuation = {
  fieldsFor(message: ProviderMessage): { readonly reasoning_content?: string };
  observe(event: ProviderEvent): void;
  commit(): void;
};

type Capture =
  | { readonly kind: "collecting"; readonly assistant: NativeAssistant }
  | { readonly kind: "complete"; readonly assistant: NativeAssistant }
  | { readonly kind: "rejected" };

function advanceCapture(capture: Capture, event: ProviderEvent): Capture {
  if (capture.kind !== "collecting") return event.type === "error" ? { kind: "rejected" } : capture;
  const assistant = capture.assistant;
  if (event.type === "error" || event.type === "cancel_ack" || event.type === "tool_call_invalid"
    || ((event.type === "reasoning_start" || event.type === "reasoning_delta") && event.redacted)) return { kind: "rejected" };
  if (event.type === "reasoning_delta") {
    if (assistant.reasoning.length + event.text.length > MAX_REASONING_CHARS) return { kind: "rejected" };
    return { kind: "collecting", assistant: { ...assistant, reasoning: assistant.reasoning + event.text } };
  }
  if (event.type === "text_delta") return { kind: "collecting", assistant: { ...assistant, text: assistant.text + event.text } };
  if (event.type === "tool_call") return { kind: "collecting", assistant: { ...assistant, calls: [...assistant.calls,
    { toolCallId: event.toolCallId, name: event.name, arguments: event.arguments }] } };
  if (event.type === "finish") {
    return event.reason === "tool_calls" && assistant.reasoning.length > 0 && assistant.calls.length > 0
      ? { kind: "complete", assistant } : { kind: "rejected" };
  }
  return capture;
}

/** Native wire continuation, owned only by this adapter instance. It never
 * changes canonical transcript/display policy or reads reasoning from a caller.
 * Scope changes erase the cache; incomplete, redacted and oversized blocks are
 * rejected whole. Only explicitly restored, verified journal records may seed
 * a new turn; canonical display reasoning never seeds the native cache.
 */
export function createGlmToolContinuation(endpoint: string, configuredModel: string) {
  let activeScope: string | undefined;
  let generation = 0;
  const cache = createGlmContinuationCache();
  let checkpoint: { readonly scope: string; readonly value: JsonObject } | undefined;

  function clear(scope: string | undefined): void {
    cache.clear(); generation += 1; activeScope = scope; checkpoint = undefined;
  }

  const binding = glmContinuationBinding(endpoint, configuredModel);
  const persistence: ProviderContinuationPort | undefined = binding === undefined ? undefined : {
    capture(scope) { return checkpoint?.scope === scope ? checkpoint.value : undefined; },
    estimateOverheadTokens: cache.estimateOverheadTokens,
    restore(input) {
      clear(JSON.stringify([providerContinuationScope(input.sessionId, input.turnId), configuredModel]));
      for (const record of input.records) {
        const assistant = readGlmCheckpoint(record, input.sessionId, binding);
        if (assistant !== undefined) cache.retain(assistant);
      }
    },
  };
  return {
    persistence,
    begin(request: ProviderRequest): GlmToolContinuation | undefined {
      const model = request.model || configuredModel;
      const scope = request.continuationScope === undefined ? undefined : JSON.stringify([request.continuationScope, model]);
      // Auxiliary model-summary calls are unscoped; they must not evict the
      // paused parent's cache. They cannot read or retain native state.
      if (scope !== undefined && scope !== activeScope) clear(scope);
      checkpoint = undefined;
      generation += 1;
      const requestBinding = glmContinuationBinding(endpoint, model);
      if (scope === undefined || requestBinding === undefined) return undefined;
      const epoch = generation;
      const available = cache.matching(request.messages);
      let capture: Capture = { kind: "collecting", assistant: { reasoning: "", text: "", calls: [] } };
      return {
        fieldsFor(message) {
          if (message.role !== "assistant" || message.toolCalls === undefined) return {};
          const text = available.get(message);
          return text === undefined ? {} : { reasoning_content: text };
        },
        observe(event) { capture = advanceCapture(capture, event); },
        commit() {
          if (epoch !== generation || capture.kind !== "complete") return;
          cache.retain(capture.assistant);
          const value = glmCheckpoint(requestBinding, request.continuationScope!, capture.assistant);
          if (value !== undefined) checkpoint = { scope: request.continuationScope!, value };
        },
      };
    },
  };
}
