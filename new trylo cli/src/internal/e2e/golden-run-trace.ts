/**
 * Golden event trace for W1 base run path.
 *
 * Recorded from a deterministic fixture run and normalized to remove
 * ephemeral identifiers and host clocks.
 */

export const GOLDEN_RUN_TRACE: ReadonlyArray<Record<string, unknown>> = [
  {
    type: "run_start",
    sessionId: "<ID>",
    turnId: "<ID>",
    providerId: "fixture-write",
  },
  {
    type: "tool_use",
    toolCallId: "<ID>",
      name: "write_file",
      input: { path: "fixture-output.txt", content: "the fixture wrote this line" },
  },
  {
    type: "tool_result",
    toolCallId: "<ID>",
    status: "succeeded",
    output: "wrote fixture-output.txt (27 bytes, created)",
    truncated: false,
    name: "write_file",
    durationMs: 0,
  },
  {
    type: "usage",
    usage: {
      inputTokens: 16,
      outputTokens: 8,
      totalTokens: 24,
    },
  },
  {
    type: "tool_use",
    toolCallId: "<ID>",
      name: "read_file",
      input: { path: "fixture-output.txt" },
  },
  {
    type: "tool_result",
    toolCallId: "<ID>",
    status: "succeeded",
    output: "the fixture wrote this line",
    truncated: false,
    name: "read_file",
    durationMs: 0,
  },
  {
    type: "usage",
    usage: {
      inputTokens: 16,
      outputTokens: 8,
      totalTokens: 24,
    },
  },
  {
    type: "message_start",
  },
  {
    type: "message_delta",
    text: "The workspac",
  },
  {
    type: "message_delta",
    text: "e file fixtu",
  },
  {
    type: "message_delta",
    text: "re-output.tx",
  },
  {
    type: "message_delta",
    text: "t now contai",
  },
  {
    type: "message_delta",
    text: "ns: the fixt",
  },
  {
    type: "message_delta",
    text: "ure wrote th",
  },
  {
    type: "message_delta",
    text: "is line",
  },
  {
    type: "usage",
    usage: {
      inputTokens: 32,
      outputTokens: 12,
      totalTokens: 44,
    },
  },
  {
    type: "message_end",
  },
  {
    type: "run_result",
    status: "completed",
    finishReason: "stop",
    sessionId: "<ID>",
    turnId: "<ID>",
    iterations: 3,
    usage: {
      inputTokens: 64,
      outputTokens: 28,
      totalTokens: 92,
    },
    durationMs: 0,
    lastMessage: "The workspace file fixture-output.txt now contains: the fixture wrote this line",
  },
];
