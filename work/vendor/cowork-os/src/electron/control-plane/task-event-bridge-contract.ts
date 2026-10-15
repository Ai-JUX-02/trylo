export const TASK_EVENT_BRIDGE_ALLOWLIST = [
  "approval_requested",
  "approval_granted",
  "approval_denied",
  "input_request_created",
  "input_request_resolved",
  "input_request_dismissed",
  "timeline_group_started",
  "timeline_group_finished",
  "timeline_step_started",
  "timeline_step_updated",
  "timeline_step_finished",
  "timeline_evidence_attached",
  "timeline_artifact_emitted",
  "timeline_command_output",
  "timeline_error",
  // M4-C (spec §6.4): context projection events. `llm_usage` feeds
  // the provider's real `delta.inputTokens` (never cumulative
  // totals) into the Work context bar; the `context_compaction_*`
  // events drive the auto-compaction state / CompactionCard. The
  // Trylo WorkContextAdapter consumes these to build a
  // ContextSnapshot.
  "llm_usage",
  "context_compaction_started",
  "context_compaction_completed",
  "context_compaction_failed",
] as const;

export type TaskEventBridgeAllowlistEvent = (typeof TASK_EVENT_BRIDGE_ALLOWLIST)[number];
