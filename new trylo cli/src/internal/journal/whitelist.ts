export const OBSERVATION_FIELDS = [
  "observationId",
  "scope",
  "taskFamily",
  "snapshotRef",
  "assetRefs",
  "outcome",
  "verdict",
  "tokenCost",
  "latencyMs",
  "causalRefs",
  "privacyClass",
  "occurredAt",
  "boardSequence",
  "reason",
  "inputRef",
] as const;

export const FORBIDDEN_FACT_FIELDS = ["rawBody", "secret", "body", "hiddenReasoning"] as const;

export type ForbiddenFactField = (typeof FORBIDDEN_FACT_FIELDS)[number];
