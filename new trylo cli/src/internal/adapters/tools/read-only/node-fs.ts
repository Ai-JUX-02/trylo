import { readFile, readdir, stat } from "node:fs/promises";
import type { DirectoryEntry, FileSystemReader } from "./limits.js";

/**
 * Node filesystem reader for the built-in read-only tools.
 *
 * Directories are never followed through a symbolic link: `withFileTypes`
 * reports a link as a link, not as a directory, so a link pointing outside the
 * workspace is skipped by the search walk instead of being traversed.
 */

export function createNodeFileSystemReader(): FileSystemReader {
  return {
    async readOptionalUtf8(absolutePath) {
      try {
        return await readFile(absolutePath, "utf8");
      } catch (error) {
        if (error instanceof Error && "code" in error && error.code === "ENOENT") return undefined;
        throw error;
      }
    },
    async readFileUtf8(absolutePath: string, signal: AbortSignal): Promise<string> {
      if (signal.aborted) {
        throw new Error("aborted");
      }
      return readFile(absolutePath, "utf8");
    },
    // WP19.1 (C25/L10): raw bytes for media inputs; text readers stay text.
    async readFileBytes(absolutePath: string, signal: AbortSignal): Promise<Uint8Array> {
      if (signal.aborted) {
        throw new Error("aborted");
      }
      return new Uint8Array(await readFile(absolutePath));
    },
    async readDir(absolutePath: string): Promise<ReadonlyArray<DirectoryEntry>> {
      const entries = await readdir(absolutePath, { withFileTypes: true });
      return entries.map((entry) => ({ name: entry.name, isDirectory: entry.isDirectory() }));
    },
    async statBytes(absolutePath: string): Promise<number> {
      return (await stat(absolutePath)).size;
    },
  };
}
