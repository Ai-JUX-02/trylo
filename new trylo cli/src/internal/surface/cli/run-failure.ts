import type { ExitCode } from "../../protocol/cli-stream.js";
import type { CliContext } from "./context.js";

/**
 * A user-facing failure of a CLI command.
 *
 * It carries an exit code, a message, and a next action. The hint is not
 * decoration: the work package requires every error to name something the
 * user can do next, and the message must never contain a secret.
 */
export type RunFailure = {
  readonly exitCode: ExitCode;
  readonly message: string;
  readonly hint: string;
  /** Durability failed after opening: surfaces must exit rather than reuse the session. */
  readonly continuation?: "session_closed";
};

export function fail(exitCode: ExitCode, message: string, hint: string): RunFailure {
  return { exitCode, message, hint };
}

export function reportFailure(ctx: CliContext, failure: RunFailure): ExitCode {
  ctx.stderr(`${failure.message}\n`);
  ctx.stderr(`${failure.hint}\n`);
  return failure.exitCode;
}
