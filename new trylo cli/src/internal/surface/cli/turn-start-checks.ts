import type { ToolPort } from "../../ports/tools.js";
import type { RunFailure } from "./run-failure.js";
import { EXIT_CODES } from "../../protocol/cli-stream.js";
import { missingSelectedTools } from "./tool-selection.js";
import { permissionLedgerRefusal, type FilePermissionStore, type PermissionLedgerInput } from "./permission-ledger-wiring.js";

/** Turn prerequisites refuse before the recorder or provider starts.
 * A requested unreadable permission ledger never becomes an absent ledger.
 * Catalog selection narrows capabilities; it cannot replace approval.
 */
export async function turnStartRefusal(
  tools: ToolPort,
  selection: readonly string[] | undefined,
  ledger: FilePermissionStore | undefined,
  requestedLedger: PermissionLedgerInput | undefined,
): Promise<RunFailure | undefined> {
  const missing = missingSelectedTools(tools, selection);
  if (missing.length > 0) return {
    exitCode: EXIT_CODES.USAGE, message: `selected tools are not mounted: ${missing.join(", ")}`,
    hint: "select exact mounted tool names; enable optional capabilities first, or use --tools=none",
  };
  return permissionLedgerRefusal(ledger, requestedLedger);
}
