/**
 * The stable code an error carries, when it has one.
 *
 * Node reports OS failures as `Error & { code }` (`ENOENT`, `EACCES`, ...), and
 * this codebase's own typed failures carry one too. The value is untrusted
 * shape from outside the type system, so it is narrowed here once instead of by
 * every boundary that needs to branch on it.
 */
export function errorCodeOf(err: unknown): string | undefined {
  if (typeof err !== "object" || err === null || !("code" in err)) {
    return undefined;
  }
  const code: unknown = err.code;
  return typeof code === "string" ? code : undefined;
}
