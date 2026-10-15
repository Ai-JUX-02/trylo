import { realpathSync } from "node:fs";
import path from "node:path";
import type { SandboxMode, SandboxPolicy } from "../../ports/tools.js";
import type { ShellModeResult } from "./shell-mode.js";

/**
 * Sandbox policy construction.
 *
 * The enums are frozen upstream (`ports/tools.ts`): there is no full-access
 * mode to reach for here because one does not exist in this package. Anything
 * that would need one is an architecture change, not a configuration value.
 */

/** Rejection, not truncation: an oversized write never becomes a short file. */
export const DEFAULT_MAX_WRITE_BYTES = 1_048_576;

export const DEFAULT_SHELL_TIMEOUT_MS = 10_000;
export const DEFAULT_MAX_SHELL_OUTPUT_BYTES = 65_536;
export const DEFAULT_MAX_SHELL_OUTPUT_LINES = 2_000;

export type WorkspaceSandboxConfig = {
  readonly workspaceRoot: string;
  readonly mode?: SandboxMode;
  readonly maxWriteBytes?: number;
  /**
   * The run's interpreter decision (WP05 C06/C07). The approval planning and
   * the execution planning must see the same mode — planning twice adds
   * checks, never chances to disagree, and a mode known only to one side
   * would refuse at approval what execution would have run, or worse.
   * Absent is the direct path.
   */
  readonly shellMode?: ShellModeResult;
};

function canonicalRoot(root: string): string {
  try {
    return realpathSync(root);
  } catch {
    return path.resolve(root);
  }
}

export function createSandboxPolicy(config: WorkspaceSandboxConfig): SandboxPolicy {
  return {
    mode: config.mode ?? "workspace_write",
    network: "restricted",
    workspaceRoot: canonicalRoot(config.workspaceRoot),
    maxWriteBytes: config.maxWriteBytes ?? DEFAULT_MAX_WRITE_BYTES,
    allowAbsoluteExecutable: false,
  };
}

/**
 * Human-readable policy summary for `doctor` style output and failure hints.
 *
 * `network=restricted` used to be printed as if it meant isolation. It does
 * not: the child process is started with proxy variables stripped and nothing
 * more, and a command that opens a socket succeeds. Saying so here is the
 * difference between a reader who assumes the sandbox contains a network and a
 * reader who knows it does not.
 */
export function describePolicy(policy: SandboxPolicy): string {
  return [
    `mode=${policy.mode}`,
    `network=${policy.network} (proxy variables stripped from the child; not OS-level isolation)`,
    `maxWriteBytes=${policy.maxWriteBytes}`,
    `absoluteExecutables=${policy.allowAbsoluteExecutable ? "allowed" : "forbidden"}`,
  ].join(" ");
}
