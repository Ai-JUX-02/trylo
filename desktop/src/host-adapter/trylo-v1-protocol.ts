// Trylo Desktop — the trylo-v1 CLI stream wire contract.
//
// P08 §3.2 / §5: this is Desktop's OWN projection of the Trylo
// Protocol CLI stream, not an import from the CLI package. The CLI
// must never depend on Desktop types and Desktop must never depend on
// the CLI's internals — the stream is the shared contract, and each
// side owns its own reading of it.
//
// Everything here is a RUNTIME GUARD, never a type assertion. §5 opens
// with "适配器必须运行时校验新 CLI 输入，不能直接类型断言" because the
// v1 vocabulary collides with the legacy one: `tool_use` and
// `tool_result` exist in BOTH, with different fields. An `as` cast
// would let a v1 frame masquerade as a Desktop LoopEvent and render a
// tool card whose `id` / `tool` / `input` are silently undefined
// (spec §12 risk #1, proven by `trylo-v1-contract.test.ts`).
//
// Unknown / malformed lines are REJECTED with a reason, not dropped —
// a silent drop is how a real protocol drift becomes an invisible bug.

/** The 12 event types the CLI stream may emit (spec §3.2). */
export const CLI_V1_EVENT_TYPES = [
  'run_start',
  'message_start',
  'message_delta',
  'message_end',
  'reasoning_start',
  'reasoning_delta',
  'reasoning_end',
  'tool_use',
  'tool_result',
  'warning',
  'usage',
  'run_result',
] as const;

export type CliV1EventType = (typeof CLI_V1_EVENT_TYPES)[number];

export function isCliV1EventType(value: unknown): value is CliV1EventType {
  return typeof value === 'string' && (CLI_V1_EVENT_TYPES as readonly string[]).includes(value);
}

export interface CliV1Usage {
  readonly inputTokens: number;
  readonly outputTokens: number;
  readonly totalTokens: number;
}

/** `run_result.status` — the ONLY authoritative terminal status. */
export type CliV1RunStatus = 'completed' | 'failed' | 'cancelled' | 'unknown';

export type CliV1Event =
  | {
      readonly type: 'run_start';
      readonly sessionId: string;
      readonly turnId: string;
      readonly providerId: string;
      readonly model: string;
    }
  | { readonly type: 'message_start' }
  | { readonly type: 'message_delta'; readonly text: string }
  | { readonly type: 'message_end' }
  | { readonly type: 'reasoning_start'; readonly redacted: boolean }
  | { readonly type: 'reasoning_delta'; readonly text: string }
  | { readonly type: 'reasoning_end' }
  | { readonly type: 'tool_use'; readonly toolCallId: string; readonly name: string; readonly input?: Record<string, unknown> }
  | {
      readonly type: 'tool_result';
      readonly toolCallId: string;
      readonly status: string;
      readonly output: string;
      readonly truncated: boolean;
      readonly message?: string;
      readonly name?: string;
      readonly code?: string;
      /** Elapsed time between the CLI's matching journal envelopes. */
      readonly durationMs?: number;
    }
  | { readonly type: 'warning'; readonly code: string; readonly message: string }
  | { readonly type: 'usage'; readonly usage: CliV1Usage }
  | {
      readonly type: 'run_result';
      readonly status: CliV1RunStatus;
      readonly finishReason: string;
      readonly sessionId: string;
      readonly turnId: string;
      readonly iterations: number;
      readonly usage: CliV1Usage;
      readonly durationMs: number;
      readonly lastMessage: string;
      readonly attemptTurnId?: string;
    };

/** Why a line was rejected. Callers surface this; they never swallow it. */
export type CliV1RejectReason =
  | 'empty'
  | 'malformed_json'
  | 'not_an_object'
  | 'missing_type'
  | 'unknown_type'
  | 'invalid_fields'
  | 'identity_mismatch';

export interface CliV1Rejected {
  readonly ok: false;
  readonly reason: CliV1RejectReason;
  /** The offending raw line, truncated so a secret-laden line can't bloat logs. */
  readonly raw: string;
}

export type CliV1ParseResult =
  | { readonly ok: true; readonly event: CliV1Event }
  | CliV1Rejected;

const MAX_RAW_IN_DIAGNOSTIC = 200;

function truncate(raw: string): string {
  return raw.length <= MAX_RAW_IN_DIAGNOSTIC ? raw : `${raw.slice(0, MAX_RAW_IN_DIAGNOSTIC)}…`;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0;
}

function isUsage(value: unknown): value is CliV1Usage {
  if (!isRecord(value)) return false;
  return (
    isCount(value.inputTokens) &&
    isCount(value.outputTokens) &&
    isCount(value.totalTokens)
  );
}

function isCount(value: unknown): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0;
}

function isDuration(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0;
}

function isRunStatus(value: unknown): value is CliV1RunStatus {
  return value === 'completed' || value === 'failed' || value === 'cancelled' || value === 'unknown';
}

/** Field-level guard for one known event type. */
function fieldsAreValid(type: CliV1EventType, raw: Record<string, unknown>): boolean {
  switch (type) {
    case 'run_start':
      return (
        isNonEmptyString(raw.sessionId) &&
        isNonEmptyString(raw.turnId) &&
        isNonEmptyString(raw.providerId) &&
        typeof raw.model === 'string'
      );
    case 'message_start':
    case 'message_end':
    case 'reasoning_end':
      return true;
    case 'message_delta':
    case 'reasoning_delta':
      return typeof raw.text === 'string';
    case 'reasoning_start':
      return typeof raw.redacted === 'boolean';
    case 'tool_use':
      return isNonEmptyString(raw.toolCallId) && isNonEmptyString(raw.name) &&
        (raw.input === undefined || isRecord(raw.input));
    case 'tool_result':
      return (
        isNonEmptyString(raw.toolCallId) &&
        (raw.status === 'succeeded' || raw.status === 'failed' || raw.status === 'cancelled' || raw.status === 'unknown') &&
        typeof raw.output === 'string' &&
        typeof raw.truncated === 'boolean' &&
        (raw.message === undefined || typeof raw.message === 'string') &&
        (raw.name === undefined || isNonEmptyString(raw.name)) &&
        (raw.code === undefined || isNonEmptyString(raw.code)) &&
        (raw.durationMs === undefined || isDuration(raw.durationMs))
      );
    case 'warning':
      // `message` may legitimately be empty — the captured golden traces
      // carry `{"code":"checkpoint","message":""}` and `{"code":"denied",
      // "message":""}`. Only `code` is required.
      return isNonEmptyString(raw.code) && typeof raw.message === 'string';
    case 'usage':
      return isUsage(raw.usage);
    case 'run_result':
      return (
        isRunStatus(raw.status) &&
        typeof raw.finishReason === 'string' &&
        isNonEmptyString(raw.sessionId) &&
        isNonEmptyString(raw.turnId) &&
        isCount(raw.iterations) &&
        isUsage(raw.usage) &&
        isDuration(raw.durationMs) &&
        typeof raw.lastMessage === 'string' &&
        (raw.attemptTurnId === undefined || isNonEmptyString(raw.attemptTurnId))
      );
    default:
      return false;
  }
}

/**
 * Parse one JSONL line as a trylo-v1 stream event.
 *
 * Rejects rather than casts: an unknown `type` is NOT forwarded as a
 * LoopEvent (that is exactly the legacy fast-path bug), and a known
 * `type` with wrong fields is rejected too.
 */
export function parseCliV1Event(line: string): CliV1ParseResult {
  const trimmed = line.trim();
  if (trimmed === '') return { ok: false, reason: 'empty', raw: '' };
  let parsed: unknown;
  try {
    parsed = JSON.parse(trimmed) as unknown;
  } catch {
    return { ok: false, reason: 'malformed_json', raw: truncate(trimmed) };
  }
  if (!isRecord(parsed)) return { ok: false, reason: 'not_an_object', raw: truncate(trimmed) };
  const type = parsed.type;
  if (typeof type !== 'string') {
    return { ok: false, reason: 'missing_type', raw: truncate(trimmed) };
  }
  if (!isCliV1EventType(type)) {
    return { ok: false, reason: 'unknown_type', raw: truncate(trimmed) };
  }
  if (!fieldsAreValid(type, parsed)) {
    return { ok: false, reason: 'invalid_fields', raw: truncate(trimmed) };
  }
  return { ok: true, event: parsed as unknown as CliV1Event };
}
