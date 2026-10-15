import type { Envelope, JsonObject, JsonValue } from "../../protocol/envelope.js";
import type { CliStreamEvent, CliUsage } from "../../protocol/cli-stream.js";

/**
 * The envelope -> CLI event translator, kept as one bounded state machine.
 *
 * A turn arrives as a stream of envelopes and leaves as a stream of CLI events.
 * Those two facts have been true in two different places: `projection.ts`
 * computed the whole sequence after the turn ended, and anything incremental
 * would have had to re-derive it. This module is the single derivation, so an
 * incremental consumer and the end-of-run projection cannot drift apart — the
 * incremental one simply receives each event earlier.
 *
 * The state is bounded on purpose: an open message, an open reasoning block,
 * and nothing else. Nothing here may look ahead, which is why the sequence is
 * identical whether it is drained at the end or pushed envelope by envelope.
 * Fields that genuinely need the whole turn (`run_result.lastMessage`,
 * cumulative usage) stay in `projection.ts` and are emitted once, at the end.
 */

export type StreamTranslator = {
  /** Zero or more events for one envelope, in the order they must be emitted. */
  push(envelope: Envelope): ReadonlyArray<CliStreamEvent>;
  /** Closes whatever is still open. Safe to call more than once. */
  finish(): ReadonlyArray<CliStreamEvent>;
};

function usageFrom(payload: Record<string, unknown>): CliUsage {
  const input = typeof payload.inputTokens === "number" ? payload.inputTokens : 0;
  const output = typeof payload.outputTokens === "number" ? payload.outputTokens : 0;
  const total = typeof payload.totalTokens === "number" ? payload.totalTokens : input + output;
  return { inputTokens: input, outputTokens: output, totalTokens: total };
}

function text(payload: Record<string, unknown>, key: string): string {
  return typeof payload[key] === "string" ? (payload[key] as string) : "";
}

function objectValue(value: JsonValue | undefined): value is JsonObject {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/**
 * One line for a failed call: the code when it adds something the message does
 * not already say, then the message as the adapter wrote it. Saying the code
 * twice reads like a stutter, and saying neither leaves the person with a
 * result they cannot act on.
 */
function failureReason(payload: Record<string, unknown>): string {
  const code = text(payload, "code");
  const message = text(payload, "message");
  if (code === "") {
    return message;
  }
  if (message === "" || message.startsWith(`${code}:`)) {
    return message === "" ? code : message;
  }
  return `${code}:${message}`;
}

/**
 * Next action for a failure code. Exit codes are derived from facts, so the
 * guidance is too: the class decides what the user should actually do. Only
 * codes with a genuinely different next step appear here.
 */
const FAILURE_ACTIONS: Readonly<Record<string, string>> = {
  auth: "no credential, or the provider rejected it: `trylo login --provider <family> --account <id>` to store one; a key from another host fails here too (`trylo auth list` shows the accounts)",
  rate_limit: "wait and retry; the provider is rate limiting",
  server: "retry later; the provider returned a server error",
  network: "check connectivity and the endpoint, then retry",
  timeout: "retry later, or point at a faster endpoint",
  protocol: "the provider sent a malformed stream; check the endpoint",
  invalid_request: "check --model, the endpoint and the request options; `trylo doctor` verifies the active connection",
  transport_fail: "the request failed before any output; retry the run",
  sent_unacked: "the stream ended without a terminal event; retry the run",
  provider_error: "the stream ended without a finish; retry the run",
  provider_throw: "the provider adapter threw; run `trylo doctor`",
  iterations_exhausted: "raise --max-iterations, or narrow the request",
  output_tokens_exhausted: "raise --max-tokens, or narrow the request",
  event_overflow: "this turn emitted more than 4096 events; split the task into smaller runs",
  context_limit: "shorten the conversation or start a new session",
  unsettled_tool_input: "the stream was cut mid tool call; retry the run",
  // A refused tool is the one failure the user *chose*. Without an action the
  // whole run reads as "denied" and nothing else, which does not say that
  // approving it, or allowing it up front, is what moves the turn forward.
  denied: "the command did not run; check the permission decision details and current policy",
  permission_denied: "the command did not run; check the permission decision details and current policy",
  expired: "the approval was never answered; re-run and answer the prompt",
  permission_unavailable: "the approval prompt could not be reached; pass --ask writes or --allow-tools <name>",
};

/**
 * A turn that did not complete must say why. The terminal envelope carries the
 * provider's message and class, so it is projected as a diagnostic instead of
 * being dropped — a silent failed run is indistinguishable from a crash.
 */
function terminalDiagnostic(payload: Record<string, unknown>): CliStreamEvent | undefined {
  const reason = text(payload, "reason");
  if (reason === "" || reason === "completed" || reason === "cancelled") {
    return undefined;
  }
  const errorClass = text(payload, "errorClass");
  const cause = text(payload, "cause");
  const message = text(payload, "message");
  const code = errorClass || cause || reason;
  const action =
    FAILURE_ACTIONS[errorClass] ?? FAILURE_ACTIONS[cause] ?? FAILURE_ACTIONS[code] ?? FAILURE_ACTIONS[message] ?? "";
  // The adapter normalises known classes so `message` often equals the code;
  // repeating it would read as noise rather than as a diagnosis.
  const detail = message === code || message === "" ? cause : message;
  // A diagnostic without a head is unactionable: the observed failure read
  // as an action with no cause ("check --model…" and nothing else never says
  // WHAT failed, with which status). The code always leads, the provider
  // detail (`http_400`) follows when it adds something, the next step closes.
  const segments = [code];
  if (detail !== "" && detail !== code && !detail.startsWith(`${code}:`)) segments.push(detail);
  if (action !== "" && action !== code && !segments.some((part) => action.startsWith(part))) segments.push(action);
  const parts = [segments.join(" - ")];
  if (cause === "output_tokens_exhausted" || cause === "iterations_exhausted") {
    if (typeof payload.budgetUsed === "number" && typeof payload.budgetLimit === "number") {
      parts.push(`used ${payload.budgetUsed} of ${payload.budgetLimit}`);
    }
    const sessionId = text(payload, "sessionId");
    if (sessionId !== "") {
      const flag = cause === "output_tokens_exhausted" ? "--max-tokens" : "--max-iterations";
      parts.push(`continue saved work: trylo run --resume ${sessionId} ${flag} <larger-budget> "continue"`);
    }
  }
  return { type: "warning", code, message: parts.join(" - ") };
}

/** The only state a turn carries: which blocks are still open. */
type BlockState = {
  messageOpen: boolean;
  /** Undefined when closed; otherwise the privacy state of the open block. */
  reasoningRedacted: boolean | undefined;
};

function closeBlocks(state: BlockState, events: CliStreamEvent[], which: "message" | "reasoning" | "all"): void {
  if ((which === "reasoning" || which === "all") && state.reasoningRedacted !== undefined) {
    events.push({ type: "reasoning_end" });
    state.reasoningRedacted = undefined;
  }
  if ((which === "message" || which === "all") && state.messageOpen) {
    events.push({ type: "message_end" });
    state.messageOpen = false;
  }
}

/**
 * Payloads are not uniform: only a few carry `code`, while most carry
 * `component` plus a `reason`. Reading only `code` made nearly every
 * degradation fall back to the envelope kind, so the user saw the word
 * "observation" and nothing else — a warning that names no speaker and no
 * cause. The ladder names the component when nothing more specific exists, and
 * only ever degrades to the kind.
 */
function warningFor(payload: Record<string, unknown>, kind: string): CliStreamEvent {
  const code = text(payload, "code") || text(payload, "component") || kind;
  const permissionMessages: Readonly<Record<string, string>> = {
    permission_user_denied: "You declined this call; it did not run.",
    permission_policy_denied: "The current permission policy refuses this call; it did not run.",
    permission_remembered_denial: "This tool is disabled for the session; revoke that decision to ask again.",
    permission_input_closed: "Approval input closed before a decision; the command did not run.",
    permission_user_cancelled: "You cancelled approval and the current turn; the command did not run.",
  };
  return {
    type: "warning",
    code,
    message: permissionMessages[code] ?? (text(payload, "message") || text(payload, "reason") || text(payload, "decision")),
  };
}

function translateInto(state: BlockState, envelope: Envelope, events: CliStreamEvent[]): void {
  switch (envelope.kind) {
    case "text":
      closeBlocks(state, events, "reasoning");
      if (!state.messageOpen) {
        events.push({ type: "message_start" });
        state.messageOpen = true;
      }
      events.push({ type: "message_delta", text: text(envelope.payload, "text") });
      break;
    case "thinking": {
      closeBlocks(state, events, "message");
      const redacted = envelope.payload.redacted === true;
      // A consumer learns privacy at reasoning_start, so a change needs a new
      // block rather than inheriting the preceding summary's visibility.
      if (state.reasoningRedacted !== redacted) {
        closeBlocks(state, events, "reasoning");
        events.push({ type: "reasoning_start", redacted });
        state.reasoningRedacted = redacted;
      }
      events.push({ type: "reasoning_delta", text: text(envelope.payload, "text") });
      break;
    }
    case "tool_use":
      closeBlocks(state, events, "all");
      events.push({
        type: "tool_use",
        toolCallId: text(envelope.payload, "toolCallId"),
        name: text(envelope.payload, "name"),
        ...(objectValue(envelope.payload.arguments)
          ? { input: envelope.payload.arguments } : {}),
      });
      break;
    case "tool_result": {
      // A failure's reason lives in `message` (and its `code`), never in
      // `output` — `output` is the tool's own text and only a success has one.
      // Projecting `output` alone is why a failed call used to render as
      // `<- <id> failed` with nothing after it, and why the person watching had
      // no way to tell which tool broke or what to do about it.
      const reason = failureReason(envelope.payload);
      events.push({
        type: "tool_result",
        toolCallId: text(envelope.payload, "toolCallId"),
        status: text(envelope.payload, "status"),
        output: text(envelope.payload, "output"),
        truncated: envelope.payload.truncated === true,
        ...(reason === "" ? {} : { message: reason }),
      });
      break;
    }
    case "usage":
      events.push({ type: "usage", usage: usageFrom(envelope.payload) });
      break;
    case "observation":
      // Remembering a successful approval is a fact, not a warning.
      if (text(envelope.payload, "component") === "permission_grant") break;
      // A successful pre-write snapshot is journal evidence, not a warning.
      // Failed snapshots keep their real error code and remain visible.
      if (text(envelope.payload, "component") === "checkpoint"
        && text(envelope.payload, "status") === "ok") break;
      if (Object.keys(envelope.payload).length === 0) break;
      events.push(warningFor(envelope.payload, envelope.kind));
      break;
    case "error":
      events.push(warningFor(envelope.payload, envelope.kind));
      break;
    case "terminal": {
      const diagnostic = terminalDiagnostic(envelope.payload);
      if (diagnostic !== undefined) {
        events.push(diagnostic);
      }
      break;
    }
    default:
      break;
  }
}

export function createStreamTranslator(): StreamTranslator {
  const state: BlockState = { messageOpen: false, reasoningRedacted: undefined };
  return {
    push(envelope: Envelope): ReadonlyArray<CliStreamEvent> {
      const events: CliStreamEvent[] = [];
      translateInto(state, envelope, events);
      return events;
    },
    finish(): ReadonlyArray<CliStreamEvent> {
      const events: CliStreamEvent[] = [];
      closeBlocks(state, events, "all");
      return events;
    },
  };
}

/**
 * The whole sequence for a finished turn. This is the batch shape of the same
 * derivation, and it is the one `projection.ts` uses.
 */
export function projectEnvelopeSequence(
  envelopes: ReadonlyArray<Envelope>,
): ReadonlyArray<CliStreamEvent> {
  const translator = createStreamTranslator();
  const events: CliStreamEvent[] = [];
  for (const envelope of envelopes) {
    events.push(...translator.push(envelope));
  }
  events.push(...translator.finish());
  return events;
}
