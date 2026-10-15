import { readdirSync, readFileSync } from "node:fs";
import type { RoleReader } from "./discover.js";

/**
 * The node-backed reader for role files (WP22.2b / L27).
 *
 * Discovery itself lives in `discover.ts` and takes the reader, so the rules
 * can be tested without a filesystem. This is only the two syscall wrappers.
 */

function isNoSuchFile(error: unknown): boolean {
  const code = (error as { code?: string }).code;
  return code === "ENOENT" || code === "ENOTDIR";
}

export function createNodeRoleReader(): RoleReader {
  return {
    listEntries(root) {
      try {
        return readdirSync(root, { withFileTypes: true })
          .filter((entry) => entry.isFile() || entry.isSymbolicLink())
          .map((entry) => entry.name);
      } catch {
        // A missing or unreadable root is "no roles here", not a failed run.
        return [];
      }
    },
    readFile(absolutePath) {
      try {
        return readFileSync(absolutePath, "utf8");
      } catch (error) {
        if (isNoSuchFile(error)) {
          return undefined;
        }
        // A file that exists and cannot be read is not the same fact as an
        // absent one; discovery turns this into a named problem.
        throw error;
      }
    },
  };
}
