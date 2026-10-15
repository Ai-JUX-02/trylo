import { boardFilesExist, loadBoardOrThrow } from "../../knowledge/store.js";
import { createMemoryReadPort } from "../../adapters/tools/memory/port.js";
import { memoryDocuments } from "../../adapters/tools/memory/source.js";
import type { MemoryDocuments, MemoryReadPort } from "../../ports/memory.js";
import type { BoardState } from "../../learning/control/state.js";
import type { ProjectContext } from "./host.js";
import { methodBoardRoot } from "./learning-sink.js";
import type { MethodLearningHost } from "./learning-sink.js";

/**
 * Where a run's memory tools read from (WP20.3: C60 / L51).
 *
 * Three facts decide whether this returns a port at all, checked in the order
 * that keeps the promise cheapest to keep:
 *
 *  - **no `--learning`, no board.** A run that never asked for learning never
 *    touches the board directory and gets no learning records. Same
 *    absent-means-off rule the rest of the wiring follows, and it matters more
 *    here than usual: a memory tool that answered "no matches" on a run with no
 *    memory would be indistinguishable from one that had forgotten everything;
 *  - **no board on disk, no learning records.** `--learning` is a switch, not a
 *    promise that anything was ever learned;
 *  - **the project context counts on its own.** Rule files the run adopted are
 *    memory too and exist whether or not learning is on, so a run with a project
 *    context gets `memory_search` over those records with the switch absent.
 *
 * The board is read **inside** the document source rather than here, so it is
 * read per search and not once per turn. That is what lets a rule activated
 * mid-turn be visible to the next search without a refresh mechanism, and it
 * keeps this function synchronous — a composition root that could block on a disk
 * read is a composition root that can hang a CLI.
 *
 * A board that exists but cannot be read is not this layer's failure to handle.
 * The board's own reader already owns the degraded-state policy; a second opinion
 * here would be a second policy. So learning records are dropped for that search
 * and the project records still answer.
 */

export type MemoryWiringInput = {
  /** Absent unless `--learning` was passed; the board is not touched without it. */
  readonly learning?: MethodLearningHost;
  readonly projectContext?: ProjectContext;
};

export function memoryPortFor(input: MemoryWiringInput): MemoryReadPort | undefined {
  const boardRoot = boardRootFor(input.learning);
  const hasProjectRecords =
    input.projectContext !== undefined && input.projectContext.sources.length > 0;
  if (boardRoot === undefined && !hasProjectRecords) {
    return undefined;
  }
  return createMemoryReadPort(documentsFrom(boardRoot, input.projectContext));
}

/**
 * The board root, or nothing.
 *
 * Both checks are the cheap kind: the switch, then `existsSync` on two paths
 * (inside `boardFilesExist`, which owns that judgement for the write side too).
 * The switch is asked first so a default run does not even stat a directory it
 * does not own, and the file check is what separates "learning is on" from
 * "learning has happened".
 */
function boardRootFor(learning: MethodLearningHost | undefined): string | undefined {
  if (learning === undefined || learning.switch === undefined) {
    return undefined;
  }
  const root = methodBoardRoot(learning.homeDir, learning.env);
  return boardFilesExist(root) ? root : undefined;
}

function documentsFrom(
  boardRoot: string | undefined,
  projectContext: ProjectContext | undefined,
): () => Promise<MemoryDocuments> {
  if (boardRoot === undefined) {
    return async () => memoryDocuments({ ...(projectContext === undefined ? {} : { projectContext }) });
  }
  return async () => {
    const board = await readBoard(boardRoot);
    return memoryDocuments({
      ...(board === undefined ? {} : { board }),
      ...(projectContext === undefined ? {} : { projectContext }),
    });
  };
}

async function readBoard(root: string): Promise<BoardState | undefined> {
  try {
    return await loadBoardOrThrow(root);
  } catch {
    // Cleanup contract: the board reader owns the degraded policy. This layer's
    // only job is to not turn a learning problem into a failed turn, so the
    // learning half of this search is empty and the project half still answers.
    return undefined;
  }
}
