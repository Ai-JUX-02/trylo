import { createHash } from "node:crypto";
import { providerContinuationScope, type ProviderOutboundToolCall } from "../../ports/provider.js";
import type { SessionRecord } from "../../ports/session.js";
import type { JsonObject, JsonValue } from "../../protocol/envelope.js";
import { isTranscriptItem } from "../../protocol/transcript.js";

export const MAX_REASONING_CHARS = 262_144;
const MAX_CHECKPOINT_CHARS = 1_048_576;
export type NativeAssistant = {
  readonly reasoning: string;
  readonly text: string;
  readonly calls: ReadonlyArray<ProviderOutboundToolCall>;
};

export function glmContinuationBinding(endpoint: string, model: string): string | undefined {
  if (!["glm-5.3-flash", "glm-5-3-flash", "glm-5-3-flash-260828"].includes(model.toLowerCase())) return undefined;
  try {
    const url = new URL(endpoint);
    if (url.protocol !== "https:" || url.hostname !== "ark.cn-beijing.volces.com"
      || url.pathname.replace(/\/$/, "") !== "/api/coding/v3/chat/completions") return undefined;
    // Hash the complete endpoint rather than persisting possible URL secrets.
    return createHash("sha256").update(JSON.stringify([url.href, model])).digest("hex");
  } catch {
    // An invalid endpoint has no identity and cannot retain native state.
    return undefined;
  }
}

function object(value: JsonValue | undefined): value is JsonObject {
  return value !== undefined && value !== null && typeof value === "object" && !Array.isArray(value);
}

export function glmCheckpoint(binding: string, scope: string, assistant: NativeAssistant): JsonObject | undefined {
  const value = { version: 1, binding, scope, assistant: { reasoning: assistant.reasoning, text: assistant.text,
    calls: assistant.calls.map(call => ({ toolCallId: call.toolCallId, name: call.name, arguments: call.arguments })) } };
  return JSON.stringify(value).length <= MAX_CHECKPOINT_CHARS ? value : undefined;
}

/** Old/foreign/partial state is a cache miss, never reconstructed from display
 * reasoning. The session loader checks journal integrity; this boundary checks
 * the native payload and the originating session/turn independently.
 */
export function readGlmCheckpoint(record: SessionRecord, sessionId: string, binding: string): NativeAssistant | undefined {
  if (record.sessionId !== sessionId || record.turnId === undefined || record.type !== "envelope") return undefined;
  const envelope = record.payload["envelope"], value = record.payload["providerContinuation"];
  if (!object(envelope) || envelope["kind"] !== "stream_end" || !object(value)
    || Object.keys(value).sort().join(",") !== "assistant,binding,scope,version"
    || value["version"] !== 1 || value["binding"] !== binding
    || value["scope"] !== providerContinuationScope(record.sessionId, record.turnId)
    || JSON.stringify(value).length > MAX_CHECKPOINT_CHARS) return undefined;
  const assistant = value["assistant"];
  if (!object(assistant) || Object.keys(assistant).sort().join(",") !== "calls,reasoning,text") return undefined;
  const reasoning = assistant["reasoning"], text = assistant["text"], rawCalls = assistant["calls"];
  if (typeof reasoning !== "string" || reasoning.length === 0 || reasoning.length > MAX_REASONING_CHARS
    || typeof text !== "string" || !Array.isArray(rawCalls) || rawCalls.length === 0) return undefined;
  const calls: ProviderOutboundToolCall[] = [], ids = new Set<string>();
  for (const raw of rawCalls) {
    if (!object(raw) || Object.keys(raw).sort().join(",") !== "arguments,name,toolCallId") return undefined;
    const item = { kind: "tool_call", sequence: 0, ...raw };
    if (!isTranscriptItem(item) || item.kind !== "tool_call" || ids.has(item.toolCallId)) return undefined;
    ids.add(item.toolCallId);
    calls.push({ toolCallId: item.toolCallId, name: item.name, arguments: item.arguments });
  }
  return { reasoning, text, calls };
}
