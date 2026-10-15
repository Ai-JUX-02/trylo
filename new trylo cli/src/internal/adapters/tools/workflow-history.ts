import type { SessionRecord } from "../../ports/session.js";
import type { ToolCallRequest, ToolOutcome, ToolPort } from "../../ports/tools.js";
import type { JsonObject, JsonValue } from "../../protocol/envelope.js";
import { GOAL_STATUSES, type GoalRecord, type GoalStatus } from "../../domain/goal.js";
import { isTranscriptItem } from "../../protocol/transcript.js";
import { createGoalTools } from "./goal/index.js";
import { createPersistentTaskTools } from "./tasks/index.js";
import { createTodoTools } from "./todo/index.js";

const TASK_NAMES = ["task_create", "task_get", "task_update", "task_list"];
const GOAL_NAMES = ["create_goal", "get_goal", "update_goal", "goal_user_action", "goal_account_tokens"];
export const WORKFLOW_TOOL_NAMES: ReadonlySet<string> = new Set(["todo_write", ...TASK_NAMES, ...GOAL_NAMES]);
const MUTATIONS = new Set(["todo_write", "task_create", "task_update", ...GOAL_NAMES.filter(name => name !== "get_goal")]);

type SettledCall = { readonly call: ToolCallRequest; readonly turnId: string; readonly value: JsonValue | undefined };
type HistoryFailure = Extract<ToolOutcome, { readonly outcome: "error" }>;

function object(value: JsonValue | undefined): JsonObject | undefined {
  return typeof value === "object" && value !== null && !Array.isArray(value) ? value as JsonObject : undefined;
}

/** Pair by session, turn and producer, consuming each result exactly once.
 * Only successful local record mutations qualify. Neither transcript echoes
 * nor effects nor child tool calls are a second state-writing authority.
 */
function settledCalls(records: readonly SessionRecord[]): readonly SettledCall[] | HistoryFailure {
  const pending = new Map<string, { readonly name: string; readonly args: JsonObject | undefined; readonly turnId: string }>();
  const argumentsByCall = new Map<string, { readonly name: string; readonly args: JsonObject }>();
  const settled: SettledCall[] = [];
  for (const record of records) {
    if (record.type === "transcript_item" && isTranscriptItem(record.payload) && record.payload.kind === "tool_call" && record.turnId !== undefined) {
      const item = record.payload;
      argumentsByCall.set(JSON.stringify([record.sessionId, record.turnId, item.toolCallId]), { name: item.name, args: item.arguments });
      continue;
    }
    if (record.type !== "envelope") continue;
    const envelope = object(record.payload.envelope);
    const payload = object(envelope?.payload);
    if (envelope === undefined || payload === undefined || envelope.producerId !== "loop") continue;
    const id = payload.toolCallId;
    const turnId = record.turnId ?? envelope.turnId;
    if (typeof id !== "string" || typeof turnId !== "string") continue;
    const key = JSON.stringify([record.sessionId, turnId, id]);
    if (envelope.kind === "tool_use") {
      // A newer use of an id replaces any unanswered use, including a use of
      // a non-workflow tool: its result must never settle the earlier call.
      pending.delete(key);
      const name = payload.name;
      if (typeof name === "string" && MUTATIONS.has(name)) {
        pending.set(key, { name, args: object(payload.arguments), turnId });
      }
    } else if (envelope.kind === "tool_result") {
      const request = pending.get(key);
      pending.delete(key);
      const transcriptCall = argumentsByCall.get(key);
      argumentsByCall.delete(key);
      if (request !== undefined && payload.status === "succeeded") {
        // Older v1 envelopes omitted arguments; the canonical tool-call item
        // already stored them. An absent/mismatched item cannot invent state.
        const args = request.args ?? (transcriptCall?.name === request.name ? transcriptCall.args : undefined);
        if (args === undefined) return invalidHistory();
        settled.push({ call: { name: request.name, arguments: args, toolCallId: id }, turnId: request.turnId, value: payload.value });
      }
    }
  }
  return settled;
}

function invalidHistory(): HistoryFailure {
  return { outcome: "error", code: "workflow_history_invalid", message: "durable workflow state cannot be restored; refusing to start an empty list" };
}

/** Goal results contain the committed state, including blocked/budget endings.
 * Restoring that state avoids inventing successful blocked reports from the
 * preceding refused requests. Turn metadata comes from the same journal.
 */
function goalFrom(call: SettledCall, previous: GoalRecord | undefined): GoalRecord | HistoryFailure {
  const value = object(call.value);
  if (value === undefined) return invalidHistory();
  const { objective, status, tokensUsed, tokenBudget } = value;
  if (typeof objective !== "string" || objective.trim().length === 0 || objective.length > 2000 ||
    typeof status !== "string" || !GOAL_STATUSES.includes(status as GoalStatus) ||
    typeof tokensUsed !== "number" || !Number.isFinite(tokensUsed) || tokensUsed < 0 ||
    (tokenBudget !== undefined && (typeof tokenBudget !== "number" || !Number.isSafeInteger(tokenBudget) || tokenBudget <= 0))) {
    return invalidHistory();
  }
  return {
    objective, status: status as GoalStatus, tokensUsed,
    createdAtTurn: call.call.name === "create_goal" ? call.turnId : previous?.createdAtTurn ?? call.turnId,
    updatedAtTurn: call.turnId,
    ...(tokenBudget === undefined ? {} : { tokenBudget: tokenBudget as number }),
  };
}

/** Restore into fresh, isolated record-only reducers. The whitelist is closed:
 * no shell, files, questions, plan approvals, MCP or process actions can run.
 * All executions await one hydration barrier, including concurrent reads.
 * No additional disk format, catalog change, or durable writer is introduced.
 */
export function createWorkflowTools(records: readonly SessionRecord[] = [], turnId?: string): ToolPort {
  const calls = settledCalls(records);
  const history = Array.isArray(calls) ? calls as readonly SettledCall[] : [];
  const tasks = createPersistentTaskTools();
  const todo = createTodoTools();
  let goal: GoalRecord | undefined;
  let failure: HistoryFailure | undefined = "outcome" in calls ? calls : undefined;
  for (const call of history.filter(item => GOAL_NAMES.includes(item.call.name))) {
    const restored = goalFrom(call, goal);
    if ("outcome" in restored) { failure = restored; break; }
    goal = restored;
  }
  const goals = createGoalTools({ ...(turnId === undefined ? {} : { turnId }), ...(goal === undefined ? {} : { seed: goal }) });
  const signal = new AbortController().signal;
  const ready = hydrate();

  async function hydrate(): Promise<HistoryFailure | undefined> {
    if (failure !== undefined) return failure;
    for (const item of history) {
      if (GOAL_NAMES.includes(item.call.name)) continue;
      const port = item.call.name === "todo_write" ? todo : tasks;
      const result = await port.execute(item.call, signal);
      if (result.outcome !== "result") return invalidHistory();
      // A create's id is durable. Reject inconsistent history rather than
      // silently assigning dependencies to a different task after resume.
      if (item.call.name === "task_create" && object(result.value.task)?.id !== object(object(item.value)?.task)?.id) {
        return invalidHistory();
      }
    }
    return undefined;
  }

  return {
    snapshot: () => [...todo.snapshot(), ...tasks.snapshot(), ...goals.snapshot()],
    async execute(call, callSignal) {
      const failed = await ready;
      if (failed !== undefined) return failed;
      const port = call.name === "todo_write" ? todo : TASK_NAMES.includes(call.name) ? tasks : goals;
      return port.execute(call, callSignal);
    },
    async cancel() { /* Record reducers settle synchronously; no external work exists. */ },
  };
}
