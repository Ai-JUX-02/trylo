import { usageError } from "./args-tokens.js";
import type { ParsedCommand } from "./args-primitives.js";

export function stdioOptionError(
  transport: string | undefined,
  format: string | undefined,
  message: ReadonlyArray<string>,
): ParsedCommand | undefined {
  if (transport === undefined) return undefined;
  if (transport !== "stdio") return usageError("unknown permission prompt transport", "use --permission-prompt-tool stdio");
  if (format !== "stream-json" || message.length > 0) {
    return usageError("stdio control requires stream-json output and a stdin user frame", "use trylo run --format stream-json --permission-prompt-tool stdio -");
  }
  return undefined;
}
