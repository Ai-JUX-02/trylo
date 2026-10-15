import {
  memoryFailure,
  type MemoryDocument,
  type MemoryMatch,
  type MemoryOutcome,
  type MemoryReadPort,
  type MemoryReadRequest,
  type MemoryReadResult,
  type MemorySearchRequest,
  type MemorySearchResult,
} from "../../../ports/memory.js";
import { createMatcher, hitsInDocument, windowFor } from "./matcher.js";

/**
 * Searching and reading records somebody else already persisted.
 *
 * This is the whole of the memory subsystem's read side. It has no writer, no
 * cache of its own, and no opinion about what should be remembered — the board
 * and the project-rule reader own those, and a second writer next to them would
 * give a run two answers to "what do I know". Documents arrive through an
 * injected source function and are re-read on every call, so a record written
 * since the last search is visible to the next one without a refresh mechanism.
 *
 * Pagination is an offset, not a token, and that is a deliberate weakening of the
 * Codex original (which also uses an offset). An offset is stable for a fixed
 * corpus and meaningless for a changing one, so `next_cursor` is only issued when
 * this search actually has more matches, and a cursor past the end is a refusal
 * rather than an empty page. A silently empty page for a stale cursor is exactly
 * the failure a model cannot detect.
 */

export const DEFAULT_SEARCH_MAX_RESULTS = 20;
export const MAX_SEARCH_MAX_RESULTS = 100;
export const DEFAULT_READ_MAX_LINES = 200;
export const MAX_READ_MAX_LINES = 2_000;
export const DEFAULT_CONTEXT_LINES = 2;

export function createMemoryReadPort(documents: MemoryReadPort["documents"]): MemoryReadPort {
  return {
    documents,
    search: (request, signal) => search(documents, request, signal),
    read: (request, signal) => read(documents, request, signal),
  };
}

function clamp(value: number | undefined, fallback: number, max: number): number {
  const requested = value ?? fallback;
  return Math.min(Math.max(1, Math.floor(requested)), max);
}

async function search(
  source: MemoryReadPort["documents"],
  request: MemorySearchRequest,
  signal: AbortSignal,
): Promise<MemoryOutcome<MemorySearchResult>> {
  const queries = request.queries.map((query) => query.trim()).filter((query) => query.length > 0);
  if (queries.length === 0 || queries.length !== request.queries.length) {
    return memoryFailure("empty_query", "memory_search requires non-empty query strings");
  }
  const window = windowFor(request.matchMode);
  if (request.matchMode === "all_within_lines" && window.kind === "all_within_lines" && window.lineCount < 1) {
    return memoryFailure("invalid_match_window", "all_within_lines needs a positive line count");
  }
  if (signal.aborted) {
    return memoryFailure("cancelled", "memory_search was cancelled");
  }
  const loaded = await source();
  if (signal.aborted) {
    return memoryFailure("cancelled", "memory_search was cancelled while reading records");
  }
  const corpus = request.documentId === undefined
    ? loaded.documents
    : loaded.documents.filter((document) => document.id === request.documentId);
  if (request.documentId !== undefined && corpus.length === 0) {
    return memoryFailure("unknown_document", `no record named ${request.documentId}`);
  }

  const matcher = createMatcher({
    queries,
    window,
    caseSensitive: request.caseSensitive,
    normalized: request.normalized,
  });
  const matches = collectMatches(corpus, matcher, window, request.contextLines);
  // Sorted by document then line so a cursor means the same thing across two
  // identical searches, which is what makes the offset above re-enterable.
  matches.sort((left, right) =>
    left.documentId === right.documentId
      ? left.matchLineNumber - right.matchLineNumber
      : left.documentId < right.documentId
        ? -1
        : 1,
  );
  const start = parseCursor(request.cursor, matches.length);
  if (start === undefined) {
    return memoryFailure("invalid_cursor", `cursor ${request.cursor ?? ""} does not name a position in these results`);
  }
  const maxResults = clamp(request.maxResults, DEFAULT_SEARCH_MAX_RESULTS, MAX_SEARCH_MAX_RESULTS);
  const end = Math.min(start + maxResults, matches.length);
  const hasMore = end < matches.length;
  const result: MemorySearchResult = {
    queries,
    matches: matches.slice(start, end),
    truncated: hasMore,
    ...(hasMore ? { nextCursor: String(end) } : {}),
  };
  return { ok: true, ...result };
}

/** `undefined` means "refuse": a cursor past the end is not an empty page. */
function parseCursor(cursor: string | undefined, total: number): number | undefined {
  if (cursor === undefined) {
    return 0;
  }
  const parsed = Number.parseInt(cursor, 10);
  if (!Number.isInteger(parsed) || parsed < 0) {
    return undefined;
  }
  return parsed <= total ? parsed : undefined;
}

function collectMatches(
  documents: ReadonlyArray<MemoryDocument>,
  matcher: ReturnType<typeof createMatcher>,
  window: ReturnType<typeof windowFor>,
  contextLines: number,
): MemoryMatch[] {
  const matches: MemoryMatch[] = [];
  for (const document of documents) {
    for (const hit of hitsInDocument(document.lines, matcher, window)) {
      matches.push({
        documentId: document.id,
        path: document.path,
        origin: document.origin,
        matchLineNumber: hit.matchStartIndex + 1,
        contentStartLineNumber: Math.max(0, hit.matchStartIndex - contextLines) + 1,
        content: document.lines
          .slice(
            Math.max(0, hit.matchStartIndex - contextLines),
            Math.min(document.lines.length, hit.matchEndIndex + contextLines + 1),
          )
          .join("\n"),
        matchedQueries: hit.matchedQueries,
      });
    }
  }
  return matches;
}

async function read(
  source: MemoryReadPort["documents"],
  request: MemoryReadRequest,
  signal: AbortSignal,
): Promise<MemoryOutcome<MemoryReadResult>> {
  if (!Number.isInteger(request.lineOffset) || request.lineOffset < 1) {
    return memoryFailure("invalid_line_offset", "line_offset is a 1-indexed line number");
  }
  if (signal.aborted) {
    return memoryFailure("cancelled", "memory_read was cancelled");
  }
  const loaded = await source();
  if (signal.aborted) {
    return memoryFailure("cancelled", "memory_read was cancelled while reading records");
  }
  const document = loaded.documents.find((entry) => entry.id === request.documentId);
  if (document === undefined) {
    return memoryFailure("unknown_document", `no record named ${request.documentId}`);
  }
  if (request.lineOffset > document.lines.length) {
    return memoryFailure(
      "invalid_line_offset",
      `${request.documentId} has ${document.lines.length} lines; line_offset ${request.lineOffset} is past the end`,
    );
  }
  const maxLines = clamp(request.maxLines, DEFAULT_READ_MAX_LINES, MAX_READ_MAX_LINES);
  const slice = document.lines.slice(request.lineOffset - 1, request.lineOffset - 1 + maxLines);
  const result: MemoryReadResult = {
    documentId: document.id,
    path: document.path,
    origin: document.origin,
    startLineNumber: request.lineOffset,
    content: slice.join("\n"),
    totalLines: document.lines.length,
    truncated: request.lineOffset - 1 + slice.length < document.lines.length,
  };
  return { ok: true, ...result };
}
