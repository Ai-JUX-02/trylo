/**
 * WP17.1 — the lifecycle hook events this CLI can fire.
 *
 * The set is the intersection the two baselines already agree on, kept whole
 * rather than trimmed to "whatever is wired today":
 *
 * -旧 CLI `utils/hooks.ts` fires ~27 events (Pre/PostToolUse, permission,
 *   session, compact, subagent, worktree, CwdChanged, FileChanged,
 *   InstructionsLoaded, …).
 * - Codex `codex-rs/hooks` fires 12 Claude-compatible events with the same
 *   names for the session/tool/compact/subagent core.
 *
 * A name appearing here does not claim a producer is wired — that is the
 * runner's and each trigger site's evidence to provide. Names are stable
 * identifiers: renaming one is a contract change with a migration note.
 */

export const HOOK_EVENTS = [
  "PreToolUse",
  "PostToolUse",
  "PostToolUseFailure",
  "PermissionRequest",
  "PermissionDenied",
  "Notification",
  "UserPromptSubmit",
  "SessionStart",
  "SessionEnd",
  "Setup",
  "Stop",
  "SubagentStart",
  "SubagentStop",
  "PreCompact",
  "PostCompact",
  "ConfigChange",
  "InstructionsLoaded",
  "WorktreeCreate",
  "WorktreeRemove",
  "CwdChanged",
  "FileChanged",
  "TaskCreated",
  "TaskCompleted",
] as const;

export type HookEvent = (typeof HOOK_EVENTS)[number];

/**
 * Events whose matcher is evaluated against the trigger value.
 *
 * Everything else is always-run: SessionStart/End, Setup, Stop,
 * UserPromptSubmit and the compact pair fire every hook registered for them,
 * mirroring Codex (`UserPromptSubmit/Stop` always run) and the old CLI's
 * session/startup hooks. A matcher written on an always-run event is not an
 * error — it is ignored, so a hook moved between events cannot silently stop
 * firing because of a stale filter.
 */
const MATCHER_EVENTS: ReadonlySet<HookEvent> = new Set([
  "PreToolUse",
  "PostToolUse",
  "PostToolUseFailure",
  "PermissionRequest",
  "PermissionDenied",
  "Notification",
  "SubagentStart",
  "SubagentStop",
  "ConfigChange",
  "InstructionsLoaded",
  "WorktreeCreate",
  "WorktreeRemove",
  "CwdChanged",
  "FileChanged",
  "TaskCreated",
  "TaskCompleted",
]);

export function isHookEvent(value: string): value is HookEvent {
  return (HOOK_EVENTS as ReadonlyArray<string>).includes(value);
}

export function isMatcherEvent(event: HookEvent): boolean {
  return MATCHER_EVENTS.has(event);
}
