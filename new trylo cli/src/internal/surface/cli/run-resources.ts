import type { SessionPort } from "../../ports/session.js";
import type { RunExecution } from "./run-execution-wiring.js";
import type { SessionPermissions } from "./session-permissions.js";

/** The prepared session closes its children before releasing permissions and the writer. */
export function closeRunResources(execution: RunExecution, permissions: SessionPermissions, session?: SessionPort, closeQuestions?: () => void): () => Promise<void> {
  let closing: Promise<void> | undefined;
  return () => closing ??= (async () => {
    try {
      await execution.close();
    } finally {
      closeQuestions?.();
      try { permissions.close(); }
      finally { await session?.release(); }
    }
  })();
}
