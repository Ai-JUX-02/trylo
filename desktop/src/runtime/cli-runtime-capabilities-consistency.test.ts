// Trylo Desktop — capability matrices and the kind→protocol mapping must
// not drift (P08 §WP7.1).
//
// Two capability tables describe the same runtimes:
//
//   - `runtime/cli-runtime-protocol.ts::capabilitiesFor(protocol)` — the
//     pre-WP7 booleans the controller reads TODAY in production
//     (`code-run-controller.ts` uses `caps.warmReuse` / `caps.controlFrames`,
//     plus `supportsSteering` / `supportsPrewarm`);
//   - `host-adapter/cli-runtime-adapter.ts::abilitiesOfKind(kind)` — the
//     §5.2 matrix the adapters will answer from in WP7.2/7.3.
//
// WP7.4 collapses them. Until then both exist and BOTH matter, so this file
// is what keeps them honest: flip `steering` for the legacy protocol in one
// place and not the other, and the UI would offer an action the adapter
// cannot perform — the §12 risk「UI 展示尚不存在的能力」.
//
// Note what is deliberately NOT here: an assertion that the kind→protocol
// mapping equals a second copy of itself. That is a tautology — it proves
// only that two functions with the same body were written twice. The mapping
// is pinned to `DEFAULT_CLI_RUNTIME_PROTOCOL` and to the closed protocol set
// instead, which are two facts with real consumers.

import { describe, expect, it } from 'vitest';
import {
  CLI_RUNTIME_PROTOCOLS,
  DEFAULT_CLI_RUNTIME_PROTOCOL,
  capabilitiesFor,
  type CliRuntimeProtocol,
} from './cli-runtime-protocol';
import {
  abilitiesOfKind,
  protocolOfKind,
  requiresPinnedInterpreter,
  type CliRuntimeKind,
} from '../host-adapter/cli-runtime-adapter';

const KINDS: readonly CliRuntimeKind[] = ['legacy', 'trylo-v1'];

describe('kind → protocol', () => {
  it('maps the new CLI kind to the public source default', () => {
    expect(protocolOfKind('trylo-v1')).toBe(DEFAULT_CLI_RUNTIME_PROTOCOL);
    expect(protocolOfKind('legacy')).toBe('legacy-stream-json');
  });

  it('covers the closed protocol set exactly once', () => {
    const covered = KINDS.map((kind) => protocolOfKind(kind));
    for (const protocol of covered) expect(CLI_RUNTIME_PROTOCOLS).toContain(protocol);
    expect([...covered].sort()).toEqual([...CLI_RUNTIME_PROTOCOLS].sort());
  });

  it('is total: an undeclared kind still lands on a declared protocol', () => {
    // Runtime guard, not a type claim. A kind rebuilt by hand from IPC must
    // not produce an undeclared protocol string that then gets compared
    // against settings with `===`.
    const undeclared = 'legacy-cli' as CliRuntimeKind;
    expect(CLI_RUNTIME_PROTOCOLS).toContain(protocolOfKind(undeclared));
  });
});

describe('capability matrices agree', () => {
  it('warmReuse means the same thing in both tables', () => {
    for (const kind of KINDS) {
      const protocol: CliRuntimeProtocol = protocolOfKind(kind);
      expect(abilitiesOfKind(kind).warmReuse).toBe(capabilitiesFor(protocol).warmReuse);
    }
  });

  it('a resident process is exactly what makes warm reuse or prewarm possible', () => {
    for (const kind of KINDS) {
      const protocol: CliRuntimeProtocol = protocolOfKind(kind);
      const legacy = capabilitiesFor(protocol);
      expect(abilitiesOfKind(kind).persistentProcess).toBe(legacy.prewarm || legacy.warmReuse);
    }
  });

  it('steering and control frames are booleans in the old table and modes in the new one', () => {
    for (const kind of KINDS) {
      const protocol: CliRuntimeProtocol = protocolOfKind(kind);
      const legacy = capabilitiesFor(protocol);
      const adapter = abilitiesOfKind(kind);
      expect(adapter.steering !== 'none').toBe(legacy.steering);
      // Control frames are exactly "the host can answer an approval".
      expect(adapter.approvals !== 'none').toBe(legacy.controlFrames);
    }
  });

  it('no runtime pins an interpreter unless it also owns a resumable session', () => {
    // Not a tautology: a kind that pins a Node but has no durable session
    // would mean the packaged runtime depends on PATH for its state, which
    // is the same class of mistake as depending on it for the binary.
    for (const kind of KINDS) {
      if (requiresPinnedInterpreter(kind)) {
        expect(abilitiesOfKind(kind).durableSessions).toBe(true);
      }
    }
  });

  it('v1 exposes host approvals while retaining one-process-per-turn ownership', () => {
    expect(abilitiesOfKind('trylo-v1').approvals).toBe('host-transport');
    expect(capabilitiesFor('trylo-v1').controlFrames).toBe(true);
    expect(abilitiesOfKind('trylo-v1').persistentProcess).toBe(false);
  });
});
