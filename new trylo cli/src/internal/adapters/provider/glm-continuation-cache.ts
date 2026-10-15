import { createHash } from "node:crypto";
import type { ProviderMessage, ProviderOutboundToolCall } from "../../ports/provider.js";
import type { NativeAssistant } from "./glm-continuation-checkpoint.js";
import { CHARS_PER_TOKEN } from "../../compaction/token-estimate.js";

const MAX_CACHE_CHARS = 1_048_576;
const MAX_ENTRIES = 32;
type Entry = { readonly key: string; readonly reasoning: string };

function assistantKey(text: string, calls: ReadonlyArray<ProviderOutboundToolCall>): string {
  return createHash("sha256").update(JSON.stringify([text, calls])).digest("hex");
}

/** Tool ids may repeat across responses/turns. Keep each occurrence, then pair
 * complete ordered groups. A compacted/evicted ambiguous subset is a miss;
 * choosing the newest value would attach another response's native state.
 */
export function createGlmContinuationCache() {
  const entries: Entry[] = [];
  let chars = 0;
  function matching(messages: ReadonlyArray<ProviderMessage>): ReadonlyMap<ProviderMessage, string> {
    const groups = new Map<string, ProviderMessage[]>(), matched = new Map<ProviderMessage, string>();
    for (const message of messages) {
      if (message.role !== "assistant" || message.toolCalls === undefined) continue;
      const key = assistantKey(message.content, message.toolCalls);
      const group = groups.get(key) ?? [];
      group.push(message); groups.set(key, group);
    }
    for (const [key, group] of groups) {
      const values = entries.filter(entry => entry.key === key);
      if (group.length !== values.length) continue;
      group.forEach((message, index) => matched.set(message, values[index]!.reasoning));
    }
    return matched;
  }
  return {
    clear() { entries.length = 0; chars = 0; },
    retain(assistant: NativeAssistant) {
      while (entries.length >= MAX_ENTRIES || chars + assistant.reasoning.length > MAX_CACHE_CHARS) {
        const oldest = entries.shift();
        if (oldest === undefined) break;
        chars -= oldest.reasoning.length;
      }
      entries.push({ key: assistantKey(assistant.text, assistant.calls), reasoning: assistant.reasoning });
      chars += assistant.reasoning.length;
    },
    matching,
    estimateOverheadTokens(messages: ReadonlyArray<ProviderMessage>) {
      let tokens = 0;
      for (const reasoning of matching(messages).values()) tokens += Math.ceil(reasoning.length / CHARS_PER_TOKEN);
      return tokens;
    },
  };
}
