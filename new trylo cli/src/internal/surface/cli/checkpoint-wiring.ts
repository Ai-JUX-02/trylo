import { existsSync } from "node:fs";
import { createFileCheckpointStore } from "../../adapters/checkpoint/store.js";
import type { CheckpointWiring } from "../../loop/checkpoint-gate.js";
import type { CheckpointPort, CheckpointResult, CheckpointSummary } from "../../ports/checkpoint.js";

/**
 * The CLI's checkpoint assembly — the one place the shipping store gets bound.
 *
 * The store lives outside the workspace it describes (`storageRoot`), which is
 * what keeps a snapshot from containing itself; the caller states both roots
 * because the store refuses a snapshot whose `workspaceRoot` does not match
 * rather than quietly copying something else.
 *
 * Snapshots are taken by the loop, listed and restored here: the run decides
 * *when* undo is made, and the person decides *whether* to use it. No automatic
 * rollback — restoring is an explicit act with an explicit id.
 */

export type CheckpointWiringInput = {
  readonly workspaceRoot: string;
  /** Outside `workspaceRoot`; validated by the store, never assumed. */
  readonly storageRoot: string;
  readonly ignores?: readonly string[];
  /** Milliseconds since the epoch, from the host's clock. */
  readonly nowMs?: number;
  /** Overridable only so a test can pin the stamped time. */
  readonly at?: string;
};

export function checkpointWiring(input: CheckpointWiringInput): CheckpointWiring {
  const port = createFileCheckpointStore({
    workspaceRoot: input.workspaceRoot,
    storageRoot: input.storageRoot,
    ...(input.ignores === undefined ? {} : { ignores: input.ignores }),
  });
  return {
    // The store is wrapped rather than changed: it stays the thing that decides
    // what a snapshot is, and this only answers the one question it answers too
    // harshly. See `listOrEmpty`.
    port: { ...port, list: () => listOrEmpty(port, input.storageRoot) },
    workspaceRoot: input.workspaceRoot,
    now: () => input.at ?? new Date(input.nowMs ?? 0).toISOString(),
  };
}

/**
 * A list against a storage root that does not exist.
 *
 * `trylo checkpoint list` on a machine where nothing was ever snapshotted used
 * to print a raw `ENOENT` and leave with 75 — the code for "temporary, try
 * again" — for a question with a perfectly good answer: this workspace has no
 * checkpoints. `trylo session list` has always answered that way, and the
 * difference between the two was never a decision, only an oversight.
 *
 * The directory is not created here. Creating it would make "never snapshotted"
 * indistinguishable from "snapshotted nothing", and the first is the fact a
 * person is asking about. Only the absent-root case is softened: a root that
 * exists but cannot be read is still a failure, reported exactly as before.
 */
async function listOrEmpty(
  port: CheckpointPort,
  storageRoot: string,
): Promise<CheckpointResult<readonly CheckpointSummary[]>> {
  if (!existsSync(storageRoot)) {
    return { ok: true, value: [] };
  }
  return await port.list();
}
