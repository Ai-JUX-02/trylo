// Trylo Desktop — the CLI runtime adapter factory (P08 §WP7.1).
//
// The factory is the single seam between "which CLI runtime is selected"
// and "which code speaks to it". It takes ONE immutable resolution and
// returns the adapter for it — or a typed failure. It never re-derives a
// path, never consults settings, and never falls back to the other
// protocol, because "try the other one" is precisely how audit P0
// happened.
//
// WP7.1 ships the seam with an EMPTY builder registry: the adapters
// themselves land in WP7.2 (legacy) and WP7.3 (trylo-v1). An empty
// registry must produce a typed failure, not a crash and not a default —
// which is why `runtime_not_built` exists as a distinct code.

import {
  isResolvedCliRuntime,
  protocolOfKind,
  type CliRuntimeAdapter,
  type CliRuntimeKind,
  type ResolvedCliRuntime,
} from './cli-runtime-adapter';

export type CliAdapterBuilder = (runtime: ResolvedCliRuntime) => CliRuntimeAdapter;

export interface CliRuntimeFactoryOptions {
  /** One builder per kind. A missing entry is a typed failure, not a throw. */
  readonly builders: Partial<Record<CliRuntimeKind, CliAdapterBuilder>>;
}

export type CliRuntimeFactoryFailureCode =
  | 'unknown_kind'
  | 'runtime_not_resolved'
  | 'runtime_mismatch'
  | 'runtime_not_built';

export type CliRuntimeFactoryResult =
  | { readonly ok: true; readonly adapter: CliRuntimeAdapter }
  | {
      readonly ok: false;
      readonly code: CliRuntimeFactoryFailureCode;
      readonly detail: string;
    };

const KINDS: readonly CliRuntimeKind[] = ['legacy', 'trylo-v1'];

/**
 * Why a runtime is not safe to build an adapter from. `''` means it is.
 *
 * Two questions, in this order:
 *
 *   1. PROVENANCE — did it come out of `defineResolvedRuntime`? A value
 *      rebuilt by hand can carry a self-consistent `kind`/`protocol` pair
 *      and still name an executable nobody resolved; consistency alone
 *      would let it through.
 *   2. CONSISTENCY — do the pair and the command actually agree? §5.1's
 *      "不能构造协议与 executable 不匹配的 runtime". The branded type makes
 *      the obvious construction unexpressible; this catches `spread` and
 *      `as unknown as`.
 */
export function describeRuntimeMismatch(runtime: ResolvedCliRuntime): string {
  if (!isResolvedCliRuntime(runtime)) {
    return 'the value did not come from defineResolvedRuntime';
  }
  const kind = runtime.kind as string;
  if (!KINDS.includes(kind as CliRuntimeKind)) {
    return `unknown runtime kind: ${kind}`;
  }
  const expected = protocolOfKind(kind as CliRuntimeKind);
  if (runtime.protocol !== expected) {
    return `kind ${kind} speaks ${expected}, but the runtime declares ${String(runtime.protocol)}`;
  }
  if (typeof runtime.command !== 'string' || runtime.command.trim() === '') {
    return `kind ${kind} has no spawn command`;
  }
  if (!Array.isArray(runtime.argsPrefix)) {
    return `kind ${kind} has no argv prefix array`;
  }
  return '';
}

/**
 * Build the factory. The returned function is total: every input
 * produces a `CliRuntimeFactoryResult`, never a throw, so a caller in a
 * React render or an event handler cannot be turned into an unhandled
 * rejection by a bad runtime.
 */
export function createCliRuntimeFactory(
  options: CliRuntimeFactoryOptions,
): (runtime: ResolvedCliRuntime) => CliRuntimeFactoryResult {
  return (runtime: ResolvedCliRuntime): CliRuntimeFactoryResult => {
    const problem = describeRuntimeMismatch(runtime);
    if (problem !== '') {
      const code: CliRuntimeFactoryFailureCode = problem.startsWith('unknown runtime kind')
        ? 'unknown_kind'
        : problem.startsWith('the value did not come from')
          ? 'runtime_not_resolved'
          : 'runtime_mismatch';
      return { ok: false, code, detail: problem };
    }
    const build = options.builders[runtime.kind];
    if (build === undefined) {
      return {
        ok: false,
        code: 'runtime_not_built',
        detail: `no adapter is registered for the ${runtime.kind} runtime yet`,
      };
    }
    return { ok: true, adapter: build(runtime) };
  };
}
