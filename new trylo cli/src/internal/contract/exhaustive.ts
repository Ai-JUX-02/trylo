/**
 * Compile-time exhaustiveness assertion that produces no unused variable warnings.
 */
export function assertExhaustive(_value: never, message?: string): never {
  throw new Error(message ?? "Unreachable branch reached in exhaustive switch");
}
