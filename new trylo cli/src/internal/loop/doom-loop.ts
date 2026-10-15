import type { PermissionAction } from "../ports/permission.js";

/**
 * Repeat detection.
 *
 * A model that retries the same call forever is not malicious, it is stuck, and
 * an approval given once must not let it keep going without anyone noticing.
 * After `threshold` identical consecutive calls the call stops being covered by
 * a remembered decision and goes back to a human (or, with nobody there, is
 * denied).
 *
 * "Identical" is decided by the fingerprint: same tool, same arguments, same
 * order they were asked in.
 */

export const DOOM_LOOP_THRESHOLD = 3;

export type DoomLoopTracker = {
  /** True when this call must be approved again even if a decision was remembered. */
  observe(action: PermissionAction): boolean;
  consecutive(): number;
  reset(): void;
};

export function createDoomLoopTracker(threshold: number = DOOM_LOOP_THRESHOLD): DoomLoopTracker {
  const recent: string[] = [];
  return {
    observe(action) {
      recent.push(action.pattern);
      if (recent.length > threshold) {
        recent.splice(0, recent.length - threshold);
      }
      if (recent.length < threshold) {
        return false;
      }
      return recent.every((pattern) => pattern === action.pattern);
    },
    consecutive() {
      return recent.length;
    },
    reset() {
      recent.length = 0;
    },
  };
}
