// Trylo Desktop — tail-read helper.
//
// Reads a JSONL file from a given byte offset, returning
// the parsed events and the leftover partial line. Uses the
// Trylo hostAdapter.fs (read_file) so we don't need a
// direct fs dependency.

export interface TailReadResult {
  events: unknown[];
  pos: number;
  leftover: string;
  totalSize: number | null;
}

export interface TailReadDeps {
  /** Read the file as a UTF-8 string. */
  readFile: (path: string) => Promise<string>;
  /** Get the file size. */
  stat: (path: string) => Promise<{ size: number } | null>;
}

/**
 * Read the NEW bytes of a JSONL file since `pos`. Returns only the
 * events appended after the previous read — never the whole file —
 * plus any leftover partial line. If the file has been truncated,
 * the caller resets to `pos` 0.
 *
 * `pos` counts string characters. The optional previousByteSize is a separate
 * stat receipt; only byte-to-byte comparisons may skip an unchanged file.
 *
 * For v1.8 the events file is small enough to read in full
 * each tick (one session ≤ ~1MB). Phase 3 will switch to
 * random-access reads via the hostAdapter.
 */
export async function tailRead(
  filePath: string,
  pos: number,
  leftover: string,
  deps: TailReadDeps,
  previousByteSize?: number,
): Promise<TailReadResult> {
  let totalSize: number | null = null;
  try {
    const s = await deps.stat(filePath);
    totalSize = s?.size ?? null;
  } catch {
    return { events: [], pos, leftover, totalSize: null };
  }
  if (totalSize === null) {
    return { events: [], pos, leftover, totalSize: null };
  }
  if (previousByteSize !== undefined && totalSize === previousByteSize) {
    return { events: [], pos, leftover, totalSize };
  }
  if (totalSize < pos) {
    // Truncated (e.g. a new session overwrote the file). Reset.
    pos = 0;
    leftover = '';
  }
  // Read full file (v1.8 simplification: a session emits
  // < 5k events; 5k * 1KB = 5MB, fine to read whole) but deliver
  // ONLY the bytes past `pos`. `leftover` (the previous incomplete
  // tail line) prefixes the delta so a line split across two reads
  // still parses exactly once.
  //
  // WHY delta-only matters: the tailer polls every 50ms and forwards
  // everything returned straight into the chat reducer. Tool /
  // thinking / text messages upsert by id (a replay self-heals), but
  // compaction appends a brand-new card per event — so a full-file
  // replay on every tick flooded the timeline with identical
  // "context compacted" pills. This slice is the single place that
  // guarantees at-most-once delivery per byte.
  const text = await deps.readFile(filePath);
  if (text.length < pos) {
    pos = 0;
    leftover = '';
  }
  const chunk = leftover + text.slice(pos);
  const lines = chunk.split('\n');
  const lastLine = lines.pop() ?? '';
  const events: unknown[] = [];
  for (const line of lines) {
    if (line.trim() === '') continue;
    try {
      events.push(JSON.parse(line));
    } catch {
      // Malformed line; skip.
    }
  }
  return { events, pos: text.length, leftover: lastLine, totalSize };
}
