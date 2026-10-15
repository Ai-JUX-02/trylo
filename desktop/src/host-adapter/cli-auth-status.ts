// Trylo Desktop — new-CLI auth / provider status (P08 §3.4 / WP4).
//
// The new CLI owns its credentials in its own ledger. Desktop's
// `ANTHROPIC_API_KEY` does NOT become a new-CLI credential, and Desktop
// must never assume it does (§3.4: 「不能假设 Desktop 的 ANTHROPIC_API_KEY
// 环境变量会自动成为新 CLI 的凭据」).
//
// So before a real-provider run we ASK the CLI what it can see, using
// the same one-shot process bridge a run uses. Two read-only commands,
// both already shipping:
//
//   `status --json`          → {"providers":[{providerId,layer,accountId,loggedIn}]}
//   `providers list --json`  → {selected, providers:[{id,kind,auth,capabilities…}]}
//
// Every failure is reported, never swallowed: an unknown auth state must
// show up as "we could not tell", not as "looks fine" (fail closed).

import { hostAdapter } from './index';
import type { FilePath } from './types';
import { cliSpawnCommand } from './cli-runtime-path';
import { openAiRequestEndpoint } from './openai-endpoint';

/** How long a read-only status probe may take before we give up. */
export const CLI_STATUS_TIMEOUT_MS = 15_000;

export interface CliProviderAuthState {
  readonly providerId: string;
  /** Which config layer resolved this provider ('none' when unset). */
  readonly layer: string;
  readonly accountId: string;
  readonly loggedIn: boolean;
}

export type CliAuthStatusReason =
  | 'spawn_failed'
  | 'timeout'
  | 'nonzero_exit'
  | 'malformed_json'
  | 'bad_shape';

export type CliAuthStatusResult =
  | { readonly ok: true; readonly providers: readonly CliProviderAuthState[] }
  | { readonly ok: false; readonly reason: CliAuthStatusReason; readonly detail: string };

export interface CliProviderDescriptor {
  readonly id: string;
  readonly kind: string;
  /** 'api_key' | 'none' — what this provider needs to run. */
  readonly auth: string;
  readonly selected: boolean;
  readonly capabilities: readonly string[];
}

export type CliProviderListResult =
  | { readonly ok: true; readonly selected: string; readonly providers: readonly CliProviderDescriptor[] }
  | { readonly ok: false; readonly reason: CliAuthStatusReason; readonly detail: string };

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/**
 * Parse result that keeps "the bytes are not JSON" apart from "the JSON
 * is not the shape we expect". The two are different failures: the
 * first is a transport/format problem, the second means the CLI changed
 * its contract and Desktop is now reading it wrong.
 */
type Parsed<T> =
  | { readonly ok: true; readonly value: T }
  | { readonly ok: false; readonly reason: 'malformed_json' | 'bad_shape' };

function parseAuthStatus(line: string): Parsed<readonly CliProviderAuthState[]> {
  let parsed: unknown;
  try {
    parsed = JSON.parse(line) as unknown;
  } catch {
    return { ok: false, reason: 'malformed_json' };
  }
  if (!isRecord(parsed) || !Array.isArray(parsed['providers'])) {
    return { ok: false, reason: 'bad_shape' };
  }
  const out: CliProviderAuthState[] = [];
  for (const raw of parsed['providers']) {
    if (!isRecord(raw)) return { ok: false, reason: 'bad_shape' };
    const id = raw['providerId'];
    if (typeof id !== 'string' || typeof raw['loggedIn'] !== 'boolean') {
      return { ok: false, reason: 'bad_shape' };
    }
    out.push({
      providerId: id,
      layer: typeof raw['layer'] === 'string' ? raw['layer'] : '',
      accountId: typeof raw['accountId'] === 'string' ? raw['accountId'] : '',
      loggedIn: raw['loggedIn'],
    });
  }
  return { ok: true, value: out };
}

function parseProviderList(
  line: string,
): Parsed<{ selected: string; providers: CliProviderDescriptor[] }> {
  let parsed: unknown;
  try {
    parsed = JSON.parse(line) as unknown;
  } catch {
    return { ok: false, reason: 'malformed_json' };
  }
  if (!isRecord(parsed) || !Array.isArray(parsed['providers'])) {
    return { ok: false, reason: 'bad_shape' };
  }
  const providers: CliProviderDescriptor[] = [];
  for (const raw of parsed['providers']) {
    if (!isRecord(raw)) return { ok: false, reason: 'bad_shape' };
    const id = raw['id'];
    if (typeof id !== 'string') return { ok: false, reason: 'bad_shape' };
    providers.push({
      id,
      kind: typeof raw['kind'] === 'string' ? raw['kind'] : '',
      auth: typeof raw['auth'] === 'string' ? raw['auth'] : '',
      selected: raw['selected'] === true,
      capabilities: Array.isArray(raw['capabilities'])
        ? raw['capabilities'].filter((c): c is string => typeof c === 'string')
        : [],
    });
  }
  return {
    ok: true,
    value: {
      selected: typeof parsed['selected'] === 'string' ? parsed['selected'] : '',
      providers,
    },
  };
}

/**
 * Run one read-only CLI command to completion and return its stdout.
 *
 * Uses the SAME process bridge a run uses — including `closeInput`, so
 * a command that happens to wait on stdin cannot hang us forever (the
 * golden trace `06-no-eof-never-starts` is exactly that failure).
 */
export async function runReadonlyCommand(
  cliPath: FilePath,
  nodeProgram: string | undefined,
  args: readonly string[],
  timeoutMs: number,
  env?: Readonly<Record<string, string>>,
  cwd?: FilePath,
): Promise<{ ok: true; stdout: string } | { ok: false; reason: CliAuthStatusReason; detail: string }> {
  // P08 §WP6: the interpreter comes from the same resolution as the
  // script — never re-derived here (a bundled Node that never reaches
  // the spawn is the same as no bundled Node).
  const { command, prefix } = cliSpawnCommand(cliPath, nodeProgram);
  let stdout = '';
  let stdoutLines = 0;
  let exitCode: number | null = null;
  // Held on an object, not a bare : TS narrows a plain variable to
  // null when its only assignment happens inside a closure, which would
  // make the call site below a type error.
  const exitGate: { resolve: (() => void) | null } = { resolve: null };
  const done = new Promise<void>((resolve) => {
    exitGate.resolve = resolve;
  });

  let handle: { id: string } | null = null;
  try {
    handle = await hostAdapter.process.spawn({
      command,
      args: [...prefix, ...args],
      label: 'trylo-cli-status',
      env,
      cwd,
      onOutput: (line) => {
        stdoutLines += 1;
        // A status command prints one JSON object; anything more is
        // unexpected but harmless to concatenate for the parser.
        stdout = stdoutLines === 1 ? line : `${stdout}\n${line}`;
      },
      onExit: (info) => {
        exitCode = info.code;
        exitGate.resolve?.();
      },
    });
    // The command takes no stdin. Close it immediately so a CLI that
    // waits for EOF can start at all.
    await hostAdapter.process.closeInput(handle.id).catch(() => undefined);
  } catch (error) {
    exitGate.resolve?.();
    return {
      ok: false,
      reason: 'spawn_failed',
      detail: error instanceof Error ? error.message : String(error),
    };
  }

  let timeoutId: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<void>((resolve) => { timeoutId = setTimeout(resolve, timeoutMs); });
  await Promise.race([done, timeout]);
  clearTimeout(timeoutId);
  if (exitCode === null) {
    if (handle) await hostAdapter.process.stop(handle.id).catch(() => undefined);
    return { ok: false, reason: 'timeout', detail: `no exit within ${timeoutMs}ms` };
  }
  if (exitCode !== 0) {
    return { ok: false, reason: 'nonzero_exit', detail: `exit=${exitCode}` };
  }
  return { ok: true, stdout };
}

/** Ask the CLI which providers are logged in. */
export async function readCliAuthStatus(args: {
  readonly cliPath: FilePath;
  /** Pinned Node from the same resolution as cliPath. */
  readonly nodeProgram?: string;
  readonly timeoutMs?: number;
  readonly env?: Readonly<Record<string, string>>;
  readonly cwd?: FilePath;
}): Promise<CliAuthStatusResult> {
  const run = await runReadonlyCommand(
    args.cliPath,
    args.nodeProgram,
    ['status', '--json'],
    args.timeoutMs ?? CLI_STATUS_TIMEOUT_MS,
    args.env,
    args.cwd,
  );
  if (!run.ok) return { ok: false, reason: run.reason, detail: run.detail };
  const parsed = parseAuthStatus(run.stdout);
  if (!parsed.ok) return { ok: false, reason: parsed.reason, detail: run.stdout.slice(0, 200) };
  return { ok: true, providers: parsed.value };
}

/** Ask the CLI which providers exist and what each needs. */
export async function readCliProviders(args: {
  readonly cliPath: FilePath;
  /** Pinned Node from the same resolution as cliPath. */
  readonly nodeProgram?: string;
  readonly timeoutMs?: number;
  readonly env?: Readonly<Record<string, string>>;
  readonly cwd?: FilePath;
}): Promise<CliProviderListResult> {
  const run = await runReadonlyCommand(
    args.cliPath,
    args.nodeProgram,
    ['providers', 'list', '--json'],
    args.timeoutMs ?? CLI_STATUS_TIMEOUT_MS,
    args.env,
    args.cwd,
  );
  if (!run.ok) return { ok: false, reason: run.reason, detail: run.detail };
  const parsed = parseProviderList(run.stdout);
  if (!parsed.ok) return { ok: false, reason: parsed.reason, detail: run.stdout.slice(0, 200) };
  return { ok: true, selected: parsed.value.selected, providers: parsed.value.providers };
}

/**
 * A sentence the UI can show when a real-provider run cannot start.
 *
 * The point of §3.4's "清晰提示": "run failed" is useless; "the CLI has
 * no credential for openai-compatible — run `trylo login`" is actionable.
 */
export function describeCliAuthProblem(
  status: CliAuthStatusResult,
  providerId: string,
): string {
  if (!status.ok) {
    switch (status.reason) {
      case 'spawn_failed':
        return `无法启动新 CLI 读取登录状态（${status.detail}）。请检查 CLI 路径。`;
      case 'timeout':
        return '新 CLI 登录状态查询超时。';
      case 'nonzero_exit':
        return `新 CLI 登录状态查询失败（${status.detail}）。`;
      default:
        return '新 CLI 登录状态无法解析（协议可能已变更）。';
    }
  }
  const target = status.providers.find((p) => p.providerId === providerId);
  if (!target) {
    return `新 CLI 未登记 provider「${providerId}」。`;
  }
  if (!target.loggedIn) {
    return `新 CLI 的 provider「${providerId}」未登录（当前解析层：${target.layer || 'none'}）。请先在新 CLI 中登录。`;
  }
  return '';
}

/**
 * Map Desktop's connection settings onto the new CLI's provider args.
 *
 * Deliberately takes NO credential: the new CLI reads its own ledger, so
 * a key here would only ever be a second (and leakable) source of truth
 * (§3.4: 「默认不自动复制，避免产生第二凭据源」).
 */
export interface ProviderArgsInput {
  /** Desktop provider selection. Empty ⇒ the CLI's own default. */
  readonly providerId?: string;
  readonly apiHost?: string;
  readonly apiModel?: string;
  readonly apiFormat?: 'anthropic' | 'openai';
}

export interface ProviderArgs {
  readonly providerId?: string;
  readonly endpoint?: string;
  readonly model?: string;
}

export function providerArgsFor(input: ProviderArgsInput): ProviderArgs {
  const out: { providerId?: string; endpoint?: string; model?: string } = {};
  const id = input.providerId?.trim();
  if (id) out.providerId = id;
  else if (input.apiFormat === 'openai') out.providerId = 'openai-compatible';
  // An empty host would override the CLI's own configured endpoint with
  // nothing, so only a real value is forwarded.
  const host = input.apiHost?.trim();
  if (host) out.endpoint = input.apiFormat === 'openai' ? openAiRequestEndpoint(host) : host;
  const model = input.apiModel?.trim();
  if (model) out.model = model;
  return out;
}
