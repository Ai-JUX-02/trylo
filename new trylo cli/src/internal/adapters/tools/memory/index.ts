import type { ToolBinding, ToolCallRequest, ToolOutcome, ToolPort } from "../../../ports/tools.js";
import {
  isMemoryMatchMode,
  type MemoryMatchMode,
  type MemoryReadPort,
} from "../../../ports/memory.js";

/**
 * `memory_search` and `memory_read`: reading what this run already knows.
 *
 * Both are `read_only` and neither needs approval, which is the point and also
 * the constraint: a memory tool that could write would be a second writer next
 * to the learning control plane, and a memory tool that needed approval would be
 * unusable — asking a human to approve a search of their own records teaches them
 * to approve it without reading, which is worse than not offering it.
 *
 * What these tools may not do is the reason the schemas look the way they do.
 * There is no `write`, no `remember`, no `forget`. A model that wants a rule
 * remembered has to propose it through the learning path, where a human and the
 * board decide whether it is true. A tool that let a model simply note something
 * down would make the board's judgement optional, and the board is the thing that
 * makes memory worth having.
 *
 * The three states stay distinct: a record that does not exist
 * (`unknown_document`), a cursor that does not address this result set
 * (`invalid_cursor`), and a corpus with nothing matching (`ok` with zero hits).
 * Collapsing the first two into an empty result is what would let a model conclude
 * "I have no memory of this" when the truth was "you asked for the wrong id".
 */

export const MEMORY_SEARCH_TOOL = "memory_search";
export const MEMORY_READ_TOOL = "memory_read";

/**
 * Every name the memory catalog declares, for dispatch and admission by name.
 *
 * Derived from the two constants for the same reason `WEB_TOOL_NAMES` is: a third
 * name written out by hand here would be a name some other list has to remember.
 */
export const MEMORY_TOOL_NAMES: ReadonlySet<string> = new Set([
  MEMORY_SEARCH_TOOL,
  MEMORY_READ_TOOL,
]);

const MATCH_MODES = ["any", "all_on_same_line", "all_within_lines"] as const;

export const MEMORY_SEARCH_BINDING: ToolBinding = {
  name: MEMORY_SEARCH_TOOL,
  description:
    "Search this project's memory: the learning rules that are currently in effect, and the project rule files this run adopted. Returns matching lines with the record each came from. Use it to find out what is already decided before asking the user, or before proposing a change to how this project works.",
  sideEffect: "read_only",
  parameters: {
    type: "object",
    properties: {
      queries: {
        type: "array",
        items: { type: "string" },
        description: "One or more substrings to look for.",
      },
      match_mode: {
        type: "string",
        enum: [...MATCH_MODES],
        description:
          "`any` (default) matches each query independently. `all_on_same_line` requires them together on one line. `all_within_lines` requires them within line_count lines of each other.",
      },
      line_count: {
        type: "number",
        description: "Window size for `all_within_lines`. Default 5.",
      },
      context_lines: {
        type: "number",
        description: "Lines of context around each hit. Default 2.",
      },
      case_sensitive: { type: "boolean", description: "Default true." },
      normalized: {
        type: "boolean",
        description:
          "Ignore separators and punctuation when comparing, so `read-file` matches `read file`. Default false.",
      },
      max_results: { type: "number", description: "Maximum hits on one page. Default 20." },
      cursor: {
        type: "string",
        description: "next_cursor from a previous result, to read the next page.",
      },
      document_id: {
        type: "string",
        description: "Restrict the search to one record, by the id a previous result reported.",
      },
    },
    required: ["queries"],
    additionalProperties: false,
  },
  needsApproval: false,
  timeoutMs: 5_000,
  outputLimits: { maxBytes: 32_768, maxLines: 1_000 },
};

export const MEMORY_READ_BINDING: ToolBinding = {
  name: MEMORY_READ_TOOL,
  description:
    "Read one memory record by the id memory_search reported, from a line offset. Use it after a search when the matching lines were not enough context.",
  sideEffect: "read_only",
  parameters: {
    type: "object",
    properties: {
      document_id: { type: "string", description: "The record id a memory_search result reported." },
      line_offset: { type: "number", description: "1-indexed first line to return. Default 1." },
      max_lines: { type: "number", description: "Maximum lines to return. Default 200." },
    },
    required: ["document_id"],
    additionalProperties: false,
  },
  needsApproval: false,
  timeoutMs: 5_000,
  outputLimits: { maxBytes: 32_768, maxLines: 1_000 },
};

export function createMemoryTools(port: MemoryReadPort): ToolPort {
  return {
    snapshot: () => [MEMORY_SEARCH_BINDING, MEMORY_READ_BINDING],

    async execute(call: ToolCallRequest, signal: AbortSignal): Promise<ToolOutcome> {
      if (call.name === MEMORY_SEARCH_TOOL) {
        return runSearch(port, call, signal);
      }
      if (call.name === MEMORY_READ_TOOL) {
        return runRead(port, call, signal);
      }
      return { outcome: "unknown", code: "unknown_tool", message: `memory tools do not implement ${call.name}` };
    },

    async cancel(): Promise<void> {
      // Reads are bounded and abortable through the injected signal.
    },
  };
}

function numberArgument(args: ToolCallRequest["arguments"], key: string): number | undefined {
  const value = args[key];
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return undefined;
  }
  return value;
}

function stringArgument(args: ToolCallRequest["arguments"], key: string): string | undefined {
  const value = args[key];
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

function booleanArgument(args: ToolCallRequest["arguments"], key: string, fallback: boolean): boolean {
  const value = args[key];
  return typeof value === "boolean" ? value : fallback;
}

function stringList(args: ToolCallRequest["arguments"], key: string): ReadonlyArray<string> | undefined {
  const value = args[key];
  if (!Array.isArray(value)) {
    return undefined;
  }
  return value.filter((item): item is string => typeof item === "string");
}

function matchModeArgument(args: ToolCallRequest["arguments"]): MemoryMatchMode | undefined {
  const value = args["match_mode"];
  return typeof value === "string" && isMemoryMatchMode(value) ? value : undefined;
}

async function runSearch(
  port: MemoryReadPort,
  call: ToolCallRequest,
  signal: AbortSignal,
): Promise<ToolOutcome> {
  const args = call.arguments;
  const queries = stringList(args, "queries");
  if (queries === undefined || queries.length === 0) {
    return { outcome: "error", code: "invalid_arguments", message: "memory_search requires a non-empty queries array" };
  }
  const requestedMode = args["match_mode"];
  if (requestedMode !== undefined && matchModeArgument(args) === undefined) {
    return {
      outcome: "error",
      code: "invalid_arguments",
      message: `memory_search match_mode must be one of ${MATCH_MODES.join(", ")}`,
    };
  }
  const cursor = stringArgument(args, "cursor");
  const documentId = stringArgument(args, "document_id");
  const outcome = await port.search(
    {
      queries,
      matchMode: matchModeArgument(args) ?? "any",
      contextLines: numberArgument(args, "context_lines") ?? 2,
      caseSensitive: booleanArgument(args, "case_sensitive", true),
      normalized: booleanArgument(args, "normalized", false),
      maxResults: numberArgument(args, "max_results") ?? 20,
      ...(cursor === undefined ? {} : { cursor }),
      ...(documentId === undefined ? {} : { documentId }),
    },
    signal,
  );
  if (!outcome.ok) {
    return { outcome: "error", code: outcome.code, message: outcome.message };
  }
  const lines = outcome.matches.map(
    (match) =>
      `${match.documentId}:${match.matchLineNumber} (${match.origin})\n${match.content}`,
  );
  const footer = outcome.truncated
    ? `\n[more results exist; call memory_search again with cursor "${outcome.nextCursor ?? ""}"]`
    : "";
  return {
    outcome: "result",
    value: {
      matchCount: outcome.matches.length,
      truncated: outcome.truncated,
      documents: outcome.matches.map((match) => ({
        documentId: match.documentId,
        path: match.path,
        origin: match.origin,
        matchLineNumber: match.matchLineNumber,
        matchedQueries: [...match.matchedQueries],
      })),
      ...(outcome.nextCursor === undefined ? {} : { nextCursor: outcome.nextCursor }),
    },
    output: lines.length === 0 ? "no matches" : `${lines.join("\n---\n")}${footer}`,
    truncated: outcome.truncated,
  };
}

async function runRead(
  port: MemoryReadPort,
  call: ToolCallRequest,
  signal: AbortSignal,
): Promise<ToolOutcome> {
  const args = call.arguments;
  const documentId = stringArgument(args, "document_id");
  if (documentId === undefined) {
    return { outcome: "error", code: "invalid_arguments", message: "memory_read requires a document_id" };
  }
  const maxLines = numberArgument(args, "max_lines");
  const outcome = await port.read(
    {
      documentId,
      lineOffset: numberArgument(args, "line_offset") ?? 1,
      ...(maxLines === undefined ? {} : { maxLines }),
    },
    signal,
  );
  if (!outcome.ok) {
    return { outcome: "error", code: outcome.code, message: outcome.message };
  }
  return {
    outcome: "result",
    value: {
      documentId: outcome.documentId,
      path: outcome.path,
      origin: outcome.origin,
      startLineNumber: outcome.startLineNumber,
      totalLines: outcome.totalLines,
      truncated: outcome.truncated,
    },
    output: outcome.content,
    truncated: outcome.truncated,
  };
}
