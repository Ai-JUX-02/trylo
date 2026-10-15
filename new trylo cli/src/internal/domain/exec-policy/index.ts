/**
 * Command execution policy: the mechanics behind C66/L64.
 *
 * This directory is the leaf evaluator. It answers one question — given an
 * argument vector and a policy someone wrote, does the policy allow this,
 * refuse it, or say nothing — and it owns no approval, no store, and no shell.
 * Whoever asks the human stays whoever asks the human today.
 */

export {
  EXEC_DECISIONS,
  isExecDecision,
  parseExecDecision,
  strictest,
  strictestOf,
  type ExecDecision,
  type ParsedDecision,
} from "./decision.js";

export {
  matchPrefix,
  parsePatternTokens,
  renderPatternToken,
  tokenMatches,
  type PatternToken,
  type PatternTokenInput,
  type PatternParseResult,
  type PrefixPattern,
} from "./pattern.js";

export {
  executableBasename,
  executableLookupKey,
  isRuleMatch,
  matchDecision,
  matchPrefixRule,
  type ExecRule,
  type PrefixRule,
  type RuleMatch,
} from "./rule.js";

export {
  EMPTY_POLICY,
  allowedPrefixes,
  evaluationMatched,
  evaluateExecPolicy,
  matchesForCommand,
  mergeExecPolicy,
  withPrefixRule,
  type ExecPolicy,
  type ExecPolicyEvaluation,
  type ExecPolicyOptions,
  type HeuristicFallback,
} from "./policy.js";

export {
  MAX_DANGEROUS_WRAPPER_DEPTH,
  dangerousCommandMatch,
  rmArgsIncludeForce,
  unmatchedCommandDecision,
  type ApprovalPosture,
  type DangerousCommandMatch,
  type UnmatchedCommandInput,
} from "./heuristics.js";

export {
  parseExecPolicyDocument,
  type PolicyHostExecutableSource,
  type PolicyParseFailure,
  type PolicyParseResult,
  type PolicyPatternWord,
  type PolicyRuleSource,
  type PolicySource,
  type SourcePlatform,
} from "./parse.js";
