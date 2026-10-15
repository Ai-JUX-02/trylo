import {
  describeFailure,
  terminateWindowsTree,
  type TreeKillDeps,
  type TreeTermination,
} from "./process-tree.js";
import { defaultTreeKillDeps } from "./process-tree.js";

/**
 * End a process that **another** process started, given only its pid
 * (WP26 / A04: `trylo bg kill` from a second terminal).
 *
 * Its own module rather than more lines in `process-tree.ts`, because that file is
 * about a child *this* process holds and this one is about a number read off disk.
 *
 * ## win32
 *
 * `taskkill /T /F` walks by pid and needs nothing else, so the policy is **the same
 * function** the in-process path calls. A second implementation of "kill the tree"
 * is how one of them drifts.
 *
 * ## POSIX — refused, not guessed
 *
 * The group path signals `-pid`, which is only correct when the target is a
 * process-group leader. A job started by another process may not be one, and
 * signalling a group this process belongs to would kill unrelated work. So POSIX
 * says no, and the record is left for a person. Not measured on a POSIX host.
 */
export async function terminatePidTree(
  pid: number,
  deps: TreeKillDeps = defaultTreeKillDeps(),
): Promise<TreeTermination> {
  if (deps.platform === "win32") {
    // `exitCode: null` is the honest value: nobody here waited on this process, so
    // nothing is known about an ending. The walk goes ahead, and taskkill's own
    // "no such process" exit is what turns the answer into `already_gone`.
    return await terminateWindowsTree({ pid, exitCode: null, kill: () => false }, deps);
  }
  return {
    ok: false,
    code: "tree_kill_unsupported_platform",
    message: describeFailure(
      "tree_kill_unsupported_platform",
      `platform ${deps.platform} cannot be tree-killed by pid without risking a group this process belongs to`,
    ),
  };
}
