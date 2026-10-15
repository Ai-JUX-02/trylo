import type { ExternalVerdict } from "../learning/domains/shared/types.js";

export function qualityDeltaIgnoringLength(
  baselinePass: boolean,
  candidatePass: boolean,
  outputLengthDelta: number,
): number {
  void outputLengthDelta;
  if (candidatePass === baselinePass) {
    return 0;
  }
  return candidatePass ? 1 : -1;
}

export function independentAnchors(
  anchors: readonly ExternalVerdict[],
): ExternalVerdict[] {
  return anchors.filter((anchor) => anchor.selfGenerated === false);
}

export function allPassed(anchors: readonly ExternalVerdict[]): boolean {
  return anchors.length > 0 && anchors.every((anchor) => anchor.result === "pass");
}

export function multiMetricBlocked(input: {
  readonly costDelta: number;
  readonly latencyDelta: number;
  readonly failureDiversity: number;
}): boolean {
  return input.costDelta >= 50 && input.latencyDelta >= 50 && input.failureDiversity < 1;
}
