import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

import type { ConditionProbe } from "../../domain/watch.js";

/**
 * The real condition probe: a filesystem, and a flag file (WP26 / A07).
 *
 * ## What a condition actually reads
 *
 * - **file_exists / file_contains** — relative to the workspace root, resolved
 *   with `path.resolve`. A watch that could read outside its workspace would make
 *   the daemon a file-existence oracle for the whole filesystem, which is not
 *   something a background scheduler should be.
 * - **command_exit** — a file the last command wrote its exit code into. There is
 *   no process registry here to ask, and inventing one would be a second owner of
 *   "what is running" (ADR §5). A file is the same mechanism the process-session
 *   port already uses for its own facts, and a caller that wants an exit code has
 *   somewhere to put it.
 * - **flag_set** — the same file, treated as a set of names. A flag is how a
 *   session says "the thing you were waiting for is true", and it must survive
 *   the session that set it, so it cannot be memory.
 *
 * ## Why one file answers three conditions
 *
 * Because "the last command exited N" and "this flag is set" are the same fact
 * from different angles, and a second file would be a second thing to clean up,
 * expire and explain. One file, three readings.
 */
export type NodeProbeOptions = {
  /** The workspace a relative path resolves against. */
  readonly workspaceRoot: string;
  /** Where a command records its exit code and where flags are written. */
  readonly stateFile: string;
};

/**
 * Build a probe over a real workspace.
 *
 * Reads are tolerant: a missing file is "not met", not an error. That is the
 * right answer for a watcher whose whole job is to notice a file appearing, and
 * it is also why an unreadable path cannot make the daemon throw inside a tick.
 */
export function nodeConditionProbe(options: NodeProbeOptions): ConditionProbe {
  const resolve = (relativePath: string): string => path.resolve(options.workspaceRoot, relativePath);

  return {
    fileExists(relativePath) {
      return safe(() => existsSync(resolve(relativePath)), false);
    },
    fileContains(relativePath, needle) {
      return safe(() => readFileSync(resolve(relativePath), "utf8").includes(needle), false);
    },
    lastExitCode() {
      return safe(() => {
        const raw = readFileSync(options.stateFile, "utf8").trim();
        if (raw.length === 0) {
          return undefined;
        }
        const parsed = Number.parseInt(raw.split(/\s+/)[0] ?? "", 10);
        return Number.isFinite(parsed) ? parsed : undefined;
      }, undefined);
    },
    flagSet(flag) {
      return safe(() => {
        const raw = readFileSync(options.stateFile, "utf8");
        // One name per line, so a flag cannot be a substring of another one —
        // `done` must not match `undone`.
        return raw
          .split(/\r?\n/)
          .map((line) => line.trim())
          .includes(flag);
      }, false);
    },
  };
}

/** Read the state file's contents, or `undefined` when there is nothing to read. */
function safe<T>(read: () => T, fallback: T): T {
  try {
    return read();
  } catch {
    // One `catch`, one outcome: a path that cannot be read is "not met". Throwing
    // would abort the tick and take the cron schedule down with a watcher whose
    // target is missing — they share a tick, not a fate.
    return fallback;
  }
}
