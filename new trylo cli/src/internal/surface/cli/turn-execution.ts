import { runTurn, type LoopPorts, type RunTurnResult } from "../../loop/runner.js";
import type { EnvelopeSink } from "../../loop/journal-emit.js";
import type { IterationBudget, UsagePricing } from "../../domain/iteration.js";
import type { TurnHostInput } from "./host.js";
import { agentMessages } from "./agent-instructions.js";

/**
 * The run's ceilings, translated once from surface input (WP09.3/L07).
 *
 * Absent ceilings mean `undefined`, which the loop reads as "no gate" — the
 * budget is something a caller states, never a packaged default. The dollar
 * ceiling and its pricing pair travel separately: the gate compares the
 * ceiling, the loop prices each stream.
 */
export function budgetOf(input: TurnHostInput): IterationBudget | undefined {
  if (
    input.maxIterations === undefined &&
    input.maxTokens === undefined &&
    input.contextTokenLimit === undefined &&
    input.maxBudgetUsd === undefined
  ) {
    return undefined;
  }
  const maxIterations = input.maxIterations;
  return {
    ...(maxIterations === undefined ? {} : { maxIterations }),
    ...(maxIterations !== undefined && maxIterations > 1 ? { finalRequest: "report_only" as const } : {}),
    ...(input.maxTokens === undefined ? {} : { maxOutputTokens: input.maxTokens }),
    ...(input.contextTokenLimit === undefined ? {} : { contextTokenLimit: input.contextTokenLimit }),
    ...(input.maxBudgetUsd === undefined ? {} : { maxCostUsd: input.maxBudgetUsd }),
  };
}

/** The pricing pair a dollar budget is enforced with; absent means unpriced. */
export function pricingOf(input: TurnHostInput): UsagePricing | undefined {
  if (input.inputPricePerMTok === undefined || input.outputPricePerMTok === undefined) {
    return undefined;
  }
  return { inputPerMTok: input.inputPricePerMTok, outputPerMTok: input.outputPricePerMTok };
}

/** Translate the surface input once; lifecycle owners stay behind loop ports. */
export function runRecordedTurn(
  ports: LoopPorts,
  input: TurnHostInput,
  budget: IterationBudget | undefined,
  pricing: UsagePricing | undefined,
  onEnvelope: EnvelopeSink,
): Promise<RunTurnResult> {
  if (input.resumeRecords !== undefined) ports.provider.continuation?.restore({
    sessionId: input.sessionId, turnId: input.turnId, records: input.resumeRecords,
  });
  return runTurn(ports, {
    sessionId: input.sessionId,
    turnId: input.turnId,
    correlationId: input.correlationId,
    text: input.text,
    model: input.model,
    now: input.now, // The host owns the clock; the loop stamps envelopes with it (D7-②).
    ...(input.resumeTranscript === undefined ? {} : { resumedTranscript: input.resumeTranscript }),
    ...(input.resumeView === undefined ? {} : { resumedWindow: input.resumeView }),
    ...(input.resumeRecords === undefined ? {} : { resumedRecords: input.resumeRecords }),
    ...(budget === undefined ? {} : { budget }),
    ...(pricing === undefined ? {} : { pricing }),
    ...(input.cancelSignal === undefined ? {} : { cancelSignal: input.cancelSignal }),
    // WP18.3: caller prompt and schema enter through the one request seam.
    // Absent — every caller that never passed the flags — the turn carries
    // exactly what it always did.
    ...(input.systemPrompt === undefined ? {} : { systemPrompt: input.systemPrompt }),
    ...(input.systemPromptAppend === undefined ? {} : { systemPromptAppend: input.systemPromptAppend }),
    ...(input.responseSchema === undefined ? {} : { responseSchema: input.responseSchema }),
    // The CLI supplies its execution guidance through the same generic seam
    // as project rules; core/library policy and permission ownership stay intact.
    callerMessages: agentMessages(input.projectContext?.messages, budget),
    onEnvelope,
  });
}
