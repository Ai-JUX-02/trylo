import type { SandboxPolicy, ToolCallRequest, ToolOutcome } from "../../../ports/tools.js";
import { planMutation } from "../../sandbox/planner.js";
import type { WriteQueue } from "./atomic-write.js";
import { executeWriteFile } from "./write-tool.js";

export type StdoutFileWriter = { readonly policy: SandboxPolicy; readonly writeQueue: WriteQueue };

/** Commit only complete successful stdout, without asking the model to copy it.
 * Re-plan the destination after the child: it may have changed the filesystem.
 * The composite command/path was admitted and approved before execution.
 */
export async function publishShellStdout(writer: StdoutFileWriter, id: string, path: string, stdout: string, signal: AbortSignal): Promise<ToolOutcome> {
  const call: ToolCallRequest = { toolCallId: id, name: "write_file", arguments: { path, content: stdout } };
  const planned = planMutation(writer.policy, call);
  if (!planned.ok) return { outcome: "error", code: planned.code, message: planned.message };
  return executeWriteFile({ writeQueue: writer.writeQueue }, call, planned.plan, signal);
}
