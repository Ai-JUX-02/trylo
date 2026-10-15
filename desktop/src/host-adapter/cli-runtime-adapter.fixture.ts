// Trylo Desktop — shared CliRuntimeAdapter contract fixture (P08 §WP7.0).
//
// Both adapters must satisfy the SAME external contract, and the only
// honest way to keep that true is to run the SAME assertions against
// both. WP7.2 (LegacyCliAdapter) and WP7.3 (TryloV1Adapter) each call
// `describeAdapterContract` with their own subject; nothing in here
// knows which CLI it is talking to.
//
// The harness is passed in rather than imported, so the assertions are
// not glued to vitest and can be re-run by another runner unchanged.

import type {
  CliCancelReason,
  CliRuntimeAdapter,
  CliTurnCompletion,
  CliTurnHandle,
  CliTurnRequest,
  ResolvedCliRuntime,
} from './cli-runtime-adapter';
import { abilitiesOfKind } from './cli-runtime-adapter';

/** The subset of a test framework this fixture needs. */
export interface ContractHarness {
  readonly describe: (name: string, body: () => void) => void;
  readonly it: (name: string, body: () => Promise<void> | void) => void;
  readonly expect: (actual: unknown) => {
    toBe(expected: unknown): void;
    toEqual(expected: unknown): void;
    toBeDefined(): void;
  };
}

export interface AdapterContractSubject {
  readonly name: string;
  /** The immutable resolution the adapter was built from. */
  readonly runtime: ResolvedCliRuntime;
  readonly make: () => CliRuntimeAdapter;
  /**
   * A request the adapter is expected to accept. The contract suite never
   * asserts on CLI-specific argv — that is what the per-adapter tests are
   * for; here we only prove the shape of the lifecycle.
   */
  readonly request: (overrides?: Partial<CliTurnRequest>) => CliTurnRequest;
  /**
   * Drive the subject's own turn to a terminal state. The fixture cannot
   * know how — a resident process and a one-shot process settle
   * differently — so the subject supplies the nudge. Optional: an adapter
   * that settles on its own needs no help.
   */
  readonly settle?: (handle: CliTurnHandle) => Promise<void>;
}

const KNOWN_COMPLETION_STATES: readonly CliTurnCompletion['state'][] = [
  'completed',
  'failed',
  'cancelled',
  'timed_out',
  'unknown_outcome',
];

/**
 * The assertions every adapter must pass. Kept intentionally about the
 * OUTSIDE of the adapter: identity of the resolution, the capability table,
 * typed results, and the lifecycle promises.
 */
export function describeAdapterContract(h: ContractHarness, subject: AdapterContractSubject): void {
  const { describe, it, expect } = h;

  describe(`CliRuntimeAdapter contract — ${subject.name}`, () => {
    it('reports the kind it was resolved for, and the shared abilities table', () => {
      const adapter = subject.make();
      expect(adapter.id).toBe(subject.runtime.kind);
      // Abilities come from the contract table, never invented per instance:
      // a UI that gates on `approvals !== 'none'` must see the same answer
      // every time the same runtime is built.
      expect(adapter.abilities).toEqual(abilitiesOfKind(subject.runtime.kind));
    });

    it('carries the exact resolution it was built from, unchanged', () => {
      // §5.1: resolution happens ONCE and is passed down as an immutable
      // value. An adapter that re-derives its own path can drift from the
      // one the settings screen shows.
      const adapter = subject.make();
      expect(adapter.runtime).toBe(subject.runtime);
    });

    it('probe() resolves to a typed result rather than throwing', async () => {
      const adapter = subject.make();
      const controller = new AbortController();
      const result = await adapter.probe(controller.signal);
      expect(typeof result.ok).toBe('boolean');
      if (result.ok) {
        expect(result.kind).toBe(subject.runtime.kind);
      } else {
        expect(typeof result.code).toBe('string');
        expect(typeof result.detail).toBe('string');
      }
      await adapter.dispose();
    });

    it('probe() honours an already-aborted signal', async () => {
      const adapter = subject.make();
      const controller = new AbortController();
      controller.abort();
      const result = await adapter.probe(controller.signal);
      // Whatever the CLI does, a caller that gave up must not be told "ok".
      expect(result.ok).toBe(false);
      await adapter.dispose();
    });

    it('startTurn() yields a handle whose completion is one of the known states', async () => {
      const adapter = subject.make();
      const handle = await adapter.startTurn(subject.request());
      expect(handle.events).toBeDefined();
      await subject.settle?.(handle);
      const completion = await handle.completion;
      expect(KNOWN_COMPLETION_STATES.includes(completion.state)).toBe(true);
      await adapter.dispose();
    });

    it('cancel() is idempotent and settles on cancelled', async () => {
      const adapter = subject.make();
      const handle = await adapter.startTurn(subject.request());
      const reason: CliCancelReason = 'user';
      await handle.cancel(reason);
      await handle.cancel(reason);
      const completion = await handle.completion;
      expect(completion.state).toBe('cancelled');
      await adapter.dispose();
    });

    it('dispose() is safe to call twice', async () => {
      const adapter = subject.make();
      await adapter.dispose();
      await adapter.dispose();
    });

    it('refuses to start a turn after dispose()', async () => {
      const adapter = subject.make();
      await adapter.dispose();
      let name = '';
      try {
        await adapter.startTurn(subject.request());
      } catch (error) {
        name = error instanceof Error ? error.name : 'not-an-error';
      }
      // A typed rejection — never a silent spawn of a process nobody owns.
      expect(name).toBe('CliRuntimeDisposedError');
    });
  });
}
