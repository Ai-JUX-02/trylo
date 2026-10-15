import type { JsonObject, JsonValue } from "../../../protocol/envelope.js";

/**
 * Argument reading for the read-only tools.
 *
 * Its own module because both `index.ts` and the split-out `read-file.ts` need
 * it, and a helper that lives in the catalog file forces the executor to import
 * the catalog to reach it.
 */

export function readStringArg(args: JsonObject, key: string): string | undefined {
  const value: JsonValue | undefined = args[key];
  return typeof value === "string" ? value : undefined;
}

/**
 * A *directory* argument, where "not named" and "named empty" mean the same
 * thing.
 *
 * A model that means "the workspace root" writes `{}`, `{"path": "."}` or
 * `{"path": ""}` depending on the day; the first two worked and the third came
 * back `invalid_path`, which is a refusal the model has nothing to act on —
 * observed as three wasted turns before it gave up and shelled out for `ls`.
 * Defaulting a blank is not a containment decision: the root is inside the
 * workspace by construction, and every non-blank value still goes through
 * `resolveInsideWorkspace` untouched.
 */
export function directoryArgument(args: JsonObject, key: string): string {
  const value = readStringArg(args, key);
  return value === undefined || value.trim().length === 0 ? "." : value;
}
