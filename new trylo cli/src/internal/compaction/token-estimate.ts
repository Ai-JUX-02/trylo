import type {
  ProviderMessage,
  ProviderOutboundToolCall,
  ProviderToolSpec,
} from "../ports/provider.js";

/**
 * The final-request token basis (WP09.1 / C35).
 *
 * A provider request is more than the text of its messages: assistant turns
 * carry `toolCalls` whose JSON arguments can dwarf the prose, messages carry
 * base64 image attachments, and the wire carries the tool table itself. The
 * estimator here counts all of it with one rule — every byte the request
 * actually carries, divided by four, rounded up per message so ten short
 * messages cannot hide inside one rounding step.
 *
 * Deliberately not a tokenizer: the threshold this feeds
 * (`budget.contextTokenLimit`) only needs to be in the same units as the
 * thing it is compared against, deterministic across runs, and unable to
 * invent a difference by reading a clock or a file.
 */

export const CHARS_PER_TOKEN = 4;

/** The bytes of a message that reach the wire beyond its bare text. */
function messageBytes(message: ProviderMessage): number {
  let bytes = Buffer.byteLength(message.content, "utf8");
  for (const call of message.toolCalls ?? []) {
    bytes += outboundCallBytes(call);
  }
  for (const attachment of message.attachments ?? []) {
    // The base64 payload is exactly what the request carries — the real size,
    // not an assumed one (WP19 attachments travel inline).
    bytes += attachment.dataBase64.length;
  }
  for (const image of message.imageReferences ?? []) bytes += 4 * Math.ceil(image.bytes / 3);
  return bytes;
}

function outboundCallBytes(call: ProviderOutboundToolCall): number {
  let bytes = Buffer.byteLength(call.toolCallId + call.name, "utf8");
  try {
    bytes += Buffer.byteLength(JSON.stringify(call.originalArguments ?? call.arguments), "utf8");
  } catch {
    // An unserializable argument object still existed; counting the id and
    // name keeps the estimate monotonic instead of pretending it was empty.
  }
  return bytes;
}

/** The token estimate for one message, rounded up on its own. */
export function estimateMessageTokens(message: ProviderMessage): number {
  return Math.ceil(messageBytes(message) / CHARS_PER_TOKEN);
}

/** The token estimate for the messages a request would carry. */
export function estimateMessagesTokens(messages: ReadonlyArray<ProviderMessage>): number {
  let tokens = 0;
  for (const message of messages) {
    tokens += estimateMessageTokens(message);
  }
  return tokens;
}

/**
 * The token estimate for the tool table itself (`tools` on the wire).
 *
 * Function definitions are part of every request a mounted catalog produces,
 * so a threshold compared against them without this term under-counts by a
 * constant per run.
 */
export function estimateToolSpecsTokens(specs: ReadonlyArray<ProviderToolSpec>): number {
  let tokens = 0;
  for (const spec of specs) {
    let bytes = Buffer.byteLength(spec.name + spec.description, "utf8");
    try {
      bytes += Buffer.byteLength(JSON.stringify(spec.parameters), "utf8");
    } catch {
      // Same monotonicity rule as call arguments above.
    }
    tokens += Math.ceil(bytes / CHARS_PER_TOKEN);
  }
  return tokens;
}
