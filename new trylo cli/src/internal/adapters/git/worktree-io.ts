import { mkdir, readFile, rmdir, realpath, stat, writeFile } from "node:fs/promises";

/**
 * Filesystem seam for managed worktrees (WP25.2 / C79, L70).
 *
 * The port's operations are a handful of git commands glued together by a few
 * filesystem facts: does this bucket already exist, is `.git` a file or a
 * directory, who owns this checkout. Those facts are the only reason the
 * manager needs the disk at all, so they are named here as a narrow seam
 * instead of being reached for through `node:fs` inline. A test can then drive
 * every branch of `create`/`list`/`remove` — including the ones that only
 * happen when git and the disk disagree — without a repository on disk.
 *
 * Two deliberate choices:
 *
 *  - **Absent is data, not an error.** `readText` answers `undefined` for a
 *    missing file because "nobody owns this checkout yet" is a real answer the
 *    caller branches on. Every other failure is reported, never swallowed.
 *  - **`removeEmptyDir` reports instead of failing.** A bucket that is not
 *    empty is the expected case once a second checkout lands in it, so a
 *    non-empty bucket is not a fault and must not abort a create or a remove.
 */

export type WorktreeIoFailure = { readonly error: string };

export type WorktreeIo = {
  /** Resolves symlinks and normalises, the way `dunce::canonicalize` does. */
  canonicalize(path: string): Promise<string | WorktreeIoFailure>;
  /** Creates with parents. Existing directory is success. */
  ensureDir(path: string): Promise<undefined | WorktreeIoFailure>;
  /** Creates exactly one level; `exists` when something is already there. */
  createDir(path: string): Promise<"created" | "exists" | WorktreeIoFailure>;
  isDirectory(path: string): Promise<boolean>;
  isFile(path: string): Promise<boolean>;
  /** `undefined` only when the file does not exist. */
  readText(path: string): Promise<string | undefined | WorktreeIoFailure>;
  /** Never overwrites: `exists` when the path is taken. */
  writeNew(path: string, text: string): Promise<"written" | "exists" | WorktreeIoFailure>;
  /** Removes only an empty directory; `removed: false` is a normal outcome. */
  removeEmptyDir(path: string): Promise<{ readonly removed: boolean }>;
};

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function codeOf(error: unknown): unknown {
  return (error as { code?: unknown } | null)?.code;
}

/**
 * The production seam. Every method converts a throw into a value, so no
 * caller up the stack needs a `catch` to keep its own invariants.
 */
export function createNodeWorktreeIo(): WorktreeIo {
  return {
    async canonicalize(path) {
      try {
        return await realpath(path);
      } catch (error) {
        return { error: messageOf(error) };
      }
    },
    async ensureDir(path) {
      try {
        await mkdir(path, { recursive: true });
        return undefined;
      } catch (error) {
        return codeOf(error) === "EEXIST" ? undefined : { error: messageOf(error) };
      }
    },
    async createDir(path) {
      try {
        await mkdir(path);
        return "created";
      } catch (error) {
        if (codeOf(error) === "EEXIST") {
          return "exists";
        }
        return { error: messageOf(error) };
      }
    },
    async isDirectory(path) {
      try {
        return (await stat(path)).isDirectory();
      } catch {
        return false;
      }
    },
    async isFile(path) {
      try {
        return (await stat(path)).isFile();
      } catch {
        return false;
      }
    },
    async readText(path) {
      try {
        return await readFile(path, "utf8");
      } catch (error) {
        return codeOf(error) === "ENOENT" ? undefined : { error: messageOf(error) };
      }
    },
    async writeNew(path, text) {
      try {
        await writeFile(path, text, { flag: "wx" });
        return "written";
      } catch (error) {
        if (codeOf(error) === "EEXIST") {
          return "exists";
        }
        return { error: messageOf(error) };
      }
    },
    async removeEmptyDir(path) {
      try {
        await rmdir(path);
        return { removed: true };
      } catch {
        // Contract: a bucket that still holds another checkout, or one that is
        // already gone, is the expected state after a create or a remove. The
        // caller asked for best-effort reclamation and gets a boolean back, so
        // nothing is hidden and nothing is forced.
        return { removed: false };
      }
    },
  };
}
