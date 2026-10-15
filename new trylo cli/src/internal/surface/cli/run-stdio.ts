import { EXIT_CODES, type ExitCode } from "../../protocol/cli-stream.js";
import type { RunCommandOptions } from "./args.js";
import type { CliContext } from "./context.js";
import type { CliSink } from "./render.js";
import { handleRun } from "./run-command.js";
import { createStdioApproval, stdioPrompt } from "./stdio-control.js";

/** One turn, with a framed prompt and approvals on the still-open stdin. */
export async function handleStdioRun(ctx: CliContext, options: RunCommandOptions, sink: CliSink): Promise<ExitCode> {
  const prompt = stdioPrompt(await ctx.readLine());
  if (prompt === undefined) {
    ctx.stderr("stdio input requires one non-empty user text frame\n");
    return EXIT_CODES.USAGE;
  }
  return handleRun({ ...ctx, approval: { requestApproval: createStdioApproval(ctx) }, readStdin: async () => prompt }, {
    ...options, ask: options.ask ?? "always", readStdin: true,
  }, sink);
}
