import type { MethodLayer } from "./contracts.js";

export const WORKING_LAYER_CAPACITY = 200;
export const SETTLE_BATCH_MAX = 16;
export const SETTLE_MIN_FIELDINGS = 3;
export const SETTLE_MIN_HELPED = 2;
export const STABLE_MIN_FIELDINGS = 8;
export const STABLE_MIN_RATIO = 0.5;
export const STABLE_RECENT_DAYS = 14;
const DAY_MS = 86_400_000;

export function nextMethodLayer(input: {
  readonly layer: MethodLayer;
  readonly fielded: number;
  readonly helped: number;
  readonly lastUsedAt: string | undefined;
  readonly at: string;
}): MethodLayer | undefined {
  const now = Date.parse(input.at);
  if (!Number.isFinite(now)) return undefined;
  if (input.layer === "working" && input.fielded >= SETTLE_MIN_FIELDINGS && input.helped >= SETTLE_MIN_HELPED) {
    return "middle";
  }
  const last = Date.parse(input.lastUsedAt ?? "");
  if (input.layer === "middle" && input.fielded >= STABLE_MIN_FIELDINGS &&
      input.helped / input.fielded >= STABLE_MIN_RATIO && Number.isFinite(last) && last <= now &&
      now - last <= STABLE_RECENT_DAYS * DAY_MS) return "stable";
  return undefined;
}
