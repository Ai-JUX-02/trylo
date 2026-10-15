// Trylo Desktop — the adapter contract suite (P08 §WP7.0 / §WP7.1).
//
// WP7.0 freezes the contract BEFORE either adapter exists, so that WP7.2
// and WP7.3 are written against a contract that is already executable
// rather than against a paragraph. The suite runs against an in-memory
// stub here; each real adapter re-runs the identical assertions through
// the same fixture.
//
// The stub is deliberately trivial: if these assertions can only be
// satisfied by a stub that knows about argv, the contract is wrong.

import { describe, expect, it } from 'vitest';
import { describeAdapterContract } from './cli-runtime-adapter.fixture';
import { createCliRuntimeFactory } from './cli-runtime-factory';
import { CliRuntimeDisposedError, defineResolvedRuntime } from './cli-runtime-adapter';
import type {
  CliCancelReason,
  CliRuntimeAdapter,
  CliTurnCompletion,
  CliTurnHandle,
  CliTurnRequest,
  ResolvedCliRuntime,
} from './cli-runtime-adapter';
import { abilitiesOfKind } from './cli-runtime-adapter';
import type { LoopEvent } from './loop-events';

/** Minimal adapter: proves the lifecycle shape without touching a CLI. */
function stubAdapter(runtime: ResolvedCliRuntime): CliRuntimeAdapter {
  let disposed = false;
  let settle: ((completion: CliTurnCompletion) => void) | null = null;

  const adapter: CliRuntimeAdapter = {
    id: runtime.kind,
    runtime,
    abilities: abilitiesOfKind(runtime.kind),
    async probe(signal) {
      if (disposed) throw new CliRuntimeDisposedError(runtime.kind);
      if (signal.aborted) return { ok: false, code: 'timeout', detail: 'aborted' };
      return { ok: true, kind: runtime.kind, version: 'stub', evidence: 'stub --version' };
    },
    async startTurn(_request: CliTurnRequest): Promise<CliTurnHandle> {
      if (disposed) throw new CliRuntimeDisposedError(runtime.kind);
      const completion = new Promise<CliTurnCompletion>((resolve) => {
        settle = resolve;
      });
      const events: AsyncIterable<LoopEvent> = {
        async *[Symbol.asyncIterator]() {
          // The stub emits nothing; the contract is about the shape.
        },
      };
      return {
        events,
        completion,
        async cancel(_reason: CliCancelReason) {
          settle?.({ state: 'cancelled', reason: _reason });
        },
      };
    },
    async dispose() {
      disposed = true;
      settle?.({ state: 'cancelled', reason: 'adapter_replaced' });
      settle = null;
    },
  };
  return adapter;
}

const LEGACY_RUNTIME = defineResolvedRuntime({
  kind: 'legacy',
  entryScript: 'C:/trylo-cli/cli.js',
  nodeProgram: 'C:/Program Files/nodejs/node.exe',
  source: 'user',
});

const V1_RUNTIME = defineResolvedRuntime({
  kind: 'trylo-v1',
  entryScript: 'C:/work/demo-ws/new trylo cli/dist/cmd/trylo/main.js',
  nodeProgram: 'C:/Program Files/nodejs/node.exe',
  source: 'development',
});

function requestOf(protocol: 'legacy-stream-json' | 'trylo-v1'): CliTurnRequest {
  return {
    prompt: 'hi',
    cwd: 'C:/work/demo-ws/workspace',
    protocol,
    permissionLevel: 'read_only',
    onEvents: () => undefined,
  };
}

if (!LEGACY_RUNTIME.ok) throw new Error(`legacy fixture must build: ${LEGACY_RUNTIME.code}`);
if (!V1_RUNTIME.ok) throw new Error(`v1 fixture must build: ${V1_RUNTIME.code}`);

describeAdapterContract({ describe, it, expect }, {
  name: 'stub',
  runtime: LEGACY_RUNTIME.runtime,
  make: () => stubAdapter(LEGACY_RUNTIME.runtime),
  request: () => requestOf('legacy-stream-json'),
  // The stub has no CLI behind it, so nothing will ever settle its turn on
  // its own. A real adapter must reach a terminal state by itself; the
  // contract only insists that whichever route is taken lands on one of
  // the five known states rather than hanging.
  settle: async (handle) => {
    await handle.cancel('user');
  },
});

describe('CliRuntimeAdapter contract — resolution identity', () => {
  it('builds the same protocol for the same kind, every time', () => {
    // §5.1: kind and protocol come out of ONE resolution. There is no API
    // that takes both, so a mismatched pair cannot be expressed.
    for (const kind of ['legacy', 'trylo-v1'] as const) {
      const built = defineResolvedRuntime({
        kind,
        entryScript: 'D:/x/cli.js',
        nodeProgram: 'D:/node/node.exe',
        source: 'user',
      });
      expect(built.ok).toBe(true);
      if (built.ok) {
        expect(built.runtime.protocol).toBe(kind === 'trylo-v1' ? 'trylo-v1' : 'legacy-stream-json');
      }
    }
  });

  it('refuses to build a Node script with no interpreter', () => {
    // Audit P1, structurally: a pinned Node that never reaches the spawn is
    // the same as no pinned Node, so the runtime cannot even be built.
    const built = defineResolvedRuntime({
      kind: 'trylo-v1',
      entryScript: 'D:/x/cli.js',
      source: 'bundled',
    });
    expect(built.ok).toBe(false);
    if (!built.ok) expect(built.code).toBe('missing_node_program');
  });

  it('accepts a non-Node entry without an interpreter', () => {
    const built = defineResolvedRuntime({
      kind: 'legacy',
      entryScript: 'C:/tools/trylo.exe',
      source: 'bundled',
    });
    expect(built.ok).toBe(true);
    if (built.ok) expect(built.runtime.command).toBe('C:/tools/trylo.exe');
  });

  it('freezes the resolved runtime', () => {
    if (!V1_RUNTIME.ok) throw new Error('fixture');
    expect(Object.isFrozen(V1_RUNTIME.runtime)).toBe(true);
  });
});

describe('CliRuntimeFactory — fail closed', () => {
  it('returns a typed failure when no builder is registered for the kind', () => {
    const factory = createCliRuntimeFactory({ builders: {} });
    const result = factory(V1_RUNTIME.ok ? V1_RUNTIME.runtime : ({} as ResolvedCliRuntime));
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.code).toBe('runtime_not_built');
  });

  it('rejects a hand-rolled runtime: provenance fails before consistency', () => {
    // Defense in depth. The branded type makes this unexpressible without a
    // cast; a cast must not get you a spawn either. Note WHICH check fires:
    // the object carries no brand, so provenance fails first — consistency
    // alone would have accepted it, because its pair agrees.
    const forged = {
      kind: 'legacy',
      protocol: 'legacy-stream-json',
      command: 'C:/attacker/node.exe',
      argsPrefix: [],
      source: 'user',
    } as unknown as ResolvedCliRuntime;
    const factory = createCliRuntimeFactory({
      builders: { legacy: (runtime) => stubAdapter(runtime) },
    });
    const result = factory(forged);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.code).toBe('runtime_not_resolved');
  });

  it('rejects a real runtime whose protocol was overwritten by spread', () => {
    // The gap the brand does NOT close: `{ ...real, protocol: 'x' }` copies
    // the brand key, so provenance passes and the pair check has to catch
    // it. This is the runtime half of §5.1's "不能构造协议与 executable
    // 不匹配的 runtime".
    if (!V1_RUNTIME.ok) throw new Error('fixture');
    const tampered = { ...V1_RUNTIME.runtime, protocol: 'legacy-stream-json' } as ResolvedCliRuntime;
    const factory = createCliRuntimeFactory({
      builders: { 'trylo-v1': (runtime) => stubAdapter(runtime) },
    });
    const result = factory(tampered);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.code).toBe('runtime_mismatch');
  });

  it('hands the adapter the same immutable resolution it was given', () => {
    if (!V1_RUNTIME.ok) throw new Error('fixture');
    const factory = createCliRuntimeFactory({
      builders: { 'trylo-v1': (runtime) => stubAdapter(runtime) },
    });
    const result = factory(V1_RUNTIME.runtime);
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.adapter.runtime).toBe(V1_RUNTIME.runtime);
  });

  it('ROLLBACK DRILL: with only the legacy builder registered, v1 is refused', () => {
    // §11.2 requires the rollback path to be EXECUTED by a test, not just
    // described. This is that execution: if the v1 adapter turns out to be
    // broken in production, dropping its builder must degrade to a typed
    // refusal — never to a silent legacy run, and never to a throw that
    // takes the window down.
    if (!V1_RUNTIME.ok) throw new Error('fixture');
    const rolledBack = createCliRuntimeFactory({
      builders: { legacy: (runtime) => stubAdapter(runtime) },
    });
    const refused = rolledBack(V1_RUNTIME.runtime);
    expect(refused.ok).toBe(false);
    if (!refused.ok) expect(refused.code).toBe('runtime_not_built');

    // …and the legacy side still works, which is the whole point of a
    // rollback: the default runtime is unaffected.
    if (!LEGACY_RUNTIME.ok) throw new Error('fixture');
    const legacy = rolledBack(LEGACY_RUNTIME.runtime);
    expect(legacy.ok).toBe(true);
    if (legacy.ok) expect(legacy.adapter.id).toBe('legacy');
  });

  it('ROLLBACK DRILL: an empty registry is the shipped WP7.1 state', () => {
    // WP7.1 lands the seam and nothing behind it. Production behaviour is
    // therefore "unreachable", not "changed" — and that must stay visible
    // as a typed code rather than an empty stub adapter that pretends.
    const shipped = createCliRuntimeFactory({ builders: {} });
    for (const runtime of [LEGACY_RUNTIME, V1_RUNTIME]) {
      if (!runtime.ok) throw new Error('fixture');
      const result = shipped(runtime.runtime);
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.code).toBe('runtime_not_built');
    }
  });
});
