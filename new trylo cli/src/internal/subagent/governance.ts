import { systemTimerScheduler, type TimerHandle, type TimerScheduler } from "./scheduler.js";
import type { SubagentGovernance, SubagentUsage } from "./types.js";

export const DEFAULT_MAX_CONCURRENCY = 4;
export const DEFAULT_SUBAGENT_TOKEN_BUDGET = 4000;
export const DEFAULT_SUBAGENT_TIMEOUT_MS = 60_000;

export class SubagentGovernanceError extends Error {
  readonly code: string;

  constructor(code: string, message: string) {
    super(message);
    this.name = "SubagentGovernanceError";
    this.code = code;
  }
}

type ManagedSubagentResources = {
  readonly subagentId: string;
  readonly abortController: AbortController;
  readonly timer?: TimerHandle | undefined;
  usage: SubagentUsage;
  readonly tokenBudget: number;
  released: boolean;
};

/**
 * The tracker's own configuration. Kept apart from `SubagentGovernance` because
 * that type is also a *per-spawn* budget override, where a scheduler would be
 * meaningless — a spawn does not choose how time is measured.
 */
export type SubagentGovernanceOptions = SubagentGovernance & {
  /**
   * Where the execution timeout comes from. Injecting a hand-fired scheduler is
   * how a test proves timeout behaviour without racing real time.
   */
  readonly scheduler?: TimerScheduler | undefined;
};

export class SubagentGovernanceTracker {
  private readonly maxConcurrency: number;
  private readonly defaultTokenBudget: number;
  private readonly defaultTimeoutMs: number;
  private readonly scheduler: TimerScheduler;
  private activeCount = 0;
  private readonly managed = new Map<string, ManagedSubagentResources>();

  constructor(options: SubagentGovernanceOptions = {}) {
    this.maxConcurrency = options.maxConcurrency ?? DEFAULT_MAX_CONCURRENCY;
    this.defaultTokenBudget = options.tokenBudget ?? DEFAULT_SUBAGENT_TOKEN_BUDGET;
    this.defaultTimeoutMs = options.timeoutMs ?? DEFAULT_SUBAGENT_TIMEOUT_MS;
    this.scheduler = options.scheduler ?? systemTimerScheduler;
  }

  getActiveCount(): number {
    return this.activeCount;
  }

  getMaxConcurrency(): number {
    return this.maxConcurrency;
  }

  /**
   * Attempts to allocate resources and a concurrency slot for a new subagent.
   * Throws SubagentGovernanceError if concurrency limit is exceeded.
   */
  allocate(
    subagentId: string,
    overrides?: SubagentGovernance,
    onTimeout?: () => void,
  ): {
    readonly abortController: AbortController;
    readonly tokenBudget: number;
    readonly timeoutMs: number;
  } {
    if (this.activeCount >= this.maxConcurrency) {
      throw new SubagentGovernanceError(
        "concurrency_limit_exceeded",
        `Subagent concurrency limit (${this.maxConcurrency}) exceeded. Active: ${this.activeCount}`,
      );
    }

    this.activeCount += 1;
    const abortController = new AbortController();
    const tokenBudget = overrides?.tokenBudget ?? this.defaultTokenBudget;
    const timeoutMs = overrides?.timeoutMs ?? this.defaultTimeoutMs;

    let timer: TimerHandle | undefined;
    if (timeoutMs > 0 && timeoutMs !== Number.POSITIVE_INFINITY) {
      timer = this.scheduler(timeoutMs, () => {
        abortController.abort("subagent_timed_out");
        if (onTimeout) {
          onTimeout();
        }
      });
    }

    this.managed.set(subagentId, {
      subagentId,
      abortController,
      timer,
      usage: { inputTokens: 0, outputTokens: 0 },
      tokenBudget,
      released: false,
    });

    return { abortController, tokenBudget, timeoutMs };
  }

  /**
   * Records token usage for a running subagent.
   * If usage exceeds the allocated tokenBudget, aborts the subagent and throws an error.
   */
  recordUsage(
    subagentId: string,
    inputTokens: number,
    outputTokens: number,
  ): SubagentUsage {
    const entry = this.managed.get(subagentId);
    if (entry === undefined) {
      return { inputTokens: 0, outputTokens: 0 };
    }

    entry.usage = {
      inputTokens: entry.usage.inputTokens + Math.max(0, inputTokens),
      outputTokens: entry.usage.outputTokens + Math.max(0, outputTokens),
    };

    const total = entry.usage.inputTokens + entry.usage.outputTokens;
    if (total > entry.tokenBudget) {
      entry.abortController.abort("token_budget_exhausted");
      throw new SubagentGovernanceError(
        "token_budget_exhausted",
        `Subagent '${subagentId}' exceeded token budget (${total} > ${entry.tokenBudget})`,
      );
    }

    return entry.usage;
  }

  getUsage(subagentId: string): SubagentUsage {
    return this.managed.get(subagentId)?.usage ?? { inputTokens: 0, outputTokens: 0 };
  }

  /**
   * Releases all resources associated with a subagent.
   * Idempotent: safe to call multiple times on completion / cancellation.
   *
   * The caller decides *when* this is true. It means the run has provably
   * stopped — not that it was told to (WP-CLI-N3): a worker that ignores its
   * abort signal keeps its slot until it returns.
   */
  release(subagentId: string): void {
    const entry = this.managed.get(subagentId);
    if (entry === undefined || entry.released) {
      return;
    }

    entry.released = true;
    entry.timer?.cancel();
    this.activeCount = Math.max(0, this.activeCount - 1);
    this.managed.delete(subagentId);
  }

  /**
   * Release all subagents and timers (for instance during host shutdown or turn cancellation).
   */
  dispose(): void {
    for (const [id, entry] of this.managed.entries()) {
      entry.timer?.cancel();
      entry.abortController.abort("governance_tracker_disposed");
      entry.released = true;
      this.managed.delete(id);
    }
    this.activeCount = 0;
  }
}
