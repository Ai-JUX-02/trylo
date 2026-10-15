/**
 * Tool-name leaves for the subagent surface, so callers that only need the
 * name (the skill tool's fork executor, the sandbox planner) do not import the
 * runtime itself — the same leaf pattern as `tools/skill/names.ts`.
 */
export const SUBAGENT_TOOL_NAME = "delegate_subagent";
