import { err, type Result } from "./contract/result.js";
import type { ForbiddenSideEffect } from "./contract/types.js";

export type SideEffectGuard = {
  readonly attempts: () => readonly ForbiddenSideEffect[];
  readonly deny: (kind: ForbiddenSideEffect) => Result<undefined, "side_effect_forbidden">;
};

export function createSideEffectGuard(): SideEffectGuard {
  const attempts: ForbiddenSideEffect[] = [];
  return {
    attempts() {
      return [...attempts];
    },
    deny(kind) {
      attempts.push(kind);
      return err("side_effect_forbidden", `${kind} is forbidden in WP-P01-D fake adapters`);
    },
  };
}

export function assertNoSideEffects(guard: SideEffectGuard): boolean {
  return guard.attempts().length === 0;
}
