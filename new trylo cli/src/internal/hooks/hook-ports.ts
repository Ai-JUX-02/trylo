/**
 * WP17 — the seams the hook runner executes through.
 *
 * Every effect a hook can have crosses one of these ports, and the runner
 * owns none of the machinery behind them:
 *
 * - `HookCommandExecutor` — production wires this to the authorised process
 *   path (WP05) under isolation (WP04). The runner never spawns.
 * - `HookHttpPort` — production wires this to the injected network port with
 *   its SSRF guard; the runner only checks the allowlist first.
 * - `HookPromptPort` / `HookAgentPort` — production wires these to the
 *   provider port and the subagent port (WP22联验); the runner only bounds
 *   recursion and concurrency around them.
 * - `HookPermissionGate` — a thin adapter over the Permission service (WP03).
 *   Permission stays the only owner of what may run; the gate cannot grant,
 *   it can only be asked.
 */

import type { JsonObject } from "../protocol/envelope.js";
import type { HookEvent } from "./hook-events.js";

/** What the command seam reports. Exit codes keep the old-CLI meaning. */
export type HookCommandResult = {
  readonly exitCode: number;
  readonly stdout: string;
  readonly stderr: string;
  readonly timedOut: boolean;
};

export type HookCommandRunOptions = {
  readonly timeoutMs: number;
  readonly signal: AbortSignal;
};

/**
 * Runs one hook command with the trigger input on stdin.
 *
 * Must honour `signal`: when it aborts, the process is killed and the result
 * reports the kill rather than whatever the dying process flushed last — a
 * late stdout must never become the hook's verdict.
 */
export type HookCommandExecutor = {
  run(argv: ReadonlyArray<string>, stdinJson: string, options: HookCommandRunOptions): Promise<HookCommandResult>;
};

export type HookHttpResponse = {
  readonly statusCode: number;
  readonly body: string;
};

export type HookHttpOptions = {
  readonly timeoutMs: number;
  readonly signal: AbortSignal;
};

/** POSTs one JSON body. Transport policy (proxy, SSRF) is the port's job. */
export type HookHttpPort = {
  post(url: string, bodyJson: string, options: HookHttpOptions): Promise<HookHttpResponse>;
};

export type HookPromptInput = {
  readonly prompt: string;
  readonly event: HookEvent;
  readonly matchValue: string;
};

export type HookPromptAnswer = {
  readonly ok: boolean;
  readonly reason: string;
  readonly additionalContext?: string | undefined;
};

export type HookPromptOptions = {
  readonly timeoutMs: number;
  readonly signal: AbortSignal;
};

/** Asks the provider port one bounded question. Unstructured output fails. */
export type HookPromptPort = {
  ask(input: HookPromptInput, options: HookPromptOptions): Promise<HookPromptAnswer>;
};

export type HookAgentInput = {
  readonly task: string;
  readonly event: HookEvent;
  readonly matchValue: string;
  readonly maxTurns: number;
};

export type HookAgentAnswer = {
  readonly ok: boolean;
  readonly reason: string;
  readonly additionalContext?: string | undefined;
  readonly turnsUsed: number;
};

export type HookAgentOptions = {
  readonly timeoutMs: number;
  readonly signal: AbortSignal;
};

/** Runs one bounded subagent turn. Over-turn or unusable output fails. */
export type HookAgentPort = {
  run(input: HookAgentInput, options: HookAgentOptions): Promise<HookAgentAnswer>;
};

export type HookAuthorization =
  | { readonly verdict: "approved" }
  | { readonly verdict: "denied"; readonly reason: string };

/**
 * Whether one hook command may have its side effects.
 *
 * Asked *before* the executor runs, for every command hook, with no
 * allowlist bypass: a hook that is not authorised does not run, and the
 * refusal itself becomes the block reason the task sees.
 */
export type HookPermissionGate = {
  authorizeHookCommand(command: ReadonlyArray<string>, event: HookEvent): Promise<HookAuthorization>;
};

/** The explicit trigger input one hook run sees. No global context. */
export type HookTrigger = {
  readonly event: HookEvent;
  readonly matchValue: string;
  readonly data: JsonObject;
  readonly depth: number;
  /** Fail-closed: an aborted trigger runs nothing. */
  readonly signal: AbortSignal;
  /**
   * The caller's ceiling on prompt/agent nesting. A hook's own `maxDepth`
   * may only tighten it, never widen it.
   */
  readonly maxDepth?: number | undefined;
};

export type HookRunnerDeps = {
  readonly command: HookCommandExecutor;
  readonly http: HookHttpPort;
  readonly prompt: HookPromptPort;
  readonly agent: HookAgentPort;
  readonly gate: HookPermissionGate;
};
