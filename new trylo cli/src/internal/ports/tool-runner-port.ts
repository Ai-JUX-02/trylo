/**
 * ToolRunnerPort — Background task execution port for tool learning & subAgents.
 *
 * Conforms strictly to P05 tool learning spec §8:
 * "ToolRunnerPort (submit background task / progress events / cancel / result),
 * used by tool learning acquisition, refinement, and crystallization.
 * Default fallback implementation = synchronous execution + progress via observation.
 * Real executor = subAgent provided by CLI infrastructure package."
 */

export type ToolRunnerStatus =
  | "pending"
  | "running"
  | "completed"
  | "failed"
  | "cancelled"
  | "timed_out";

export type ToolRunnerTask = {
  readonly taskId: string;
  readonly name: string;
  readonly description?: string | undefined;
  readonly input: Record<string, unknown>;
  readonly parentAgentId?: string | undefined;
  readonly rootAttemptId?: string | undefined;
  readonly timeoutMs?: number | undefined;
};

export type ToolRunnerProgress = {
  readonly taskId: string;
  readonly percentage?: number | undefined;
  readonly message: string;
  readonly timestamp: string;
};

export type ToolRunnerError = {
  readonly code: string;
  readonly message: string;
};

/**
 * How an *observation* ended, as distinct from how the observed run ended.
 *
 * Live in the port layer because two ports share it: `ToolRunnerPort.wait` and
 * the subagent lifecycle both let a waiter give up on a run that continues.
 * `"timeout"` says the waiter stopped waiting and `status` is the run's state at
 * that instant — which need not be terminal, and must never be reported as one
 * (WP-CLI-N3: an observation timeout cannot be disguised as a task terminal).
 */
export type ObservationOutcome = "terminal" | "timeout";

export type ToolRunnerResult = {
  readonly taskId: string;
  readonly status: ToolRunnerStatus;
  /** How the wait that produced this value ended; see `ObservationOutcome`. */
  readonly observed: ObservationOutcome;
  readonly output?: unknown;
  readonly error?: ToolRunnerError | undefined;
  readonly usage?: {
    readonly inputTokens: number;
    readonly outputTokens: number;
  } | undefined;
};

export type ProgressListener = (progress: ToolRunnerProgress) => void;

export type ToolRunnerPort = {
  submit(task: ToolRunnerTask): Promise<{ readonly taskId: string }>;
  onProgress(taskId: string, listener: ProgressListener): () => void;
  cancel(taskId: string, reason?: string | undefined): Promise<boolean>;
  wait(taskId: string, timeoutMs?: number | undefined): Promise<ToolRunnerResult>;
  status(taskId: string): Promise<ToolRunnerStatus>;
};
