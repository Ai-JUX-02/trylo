// Trylo Desktop — the `ResolvedCliRuntime` brand, tested as a threat model
// (P08 §WP7.1).
//
// §5.1's first invariant is "不能构造协议与 executable 不匹配的 runtime".
// The implementation says that is enforced by a non-exported symbol key on
// the interface. That claim is only worth anything if it is TESTED, and the
// honest way to test "you cannot write this" is a compile-time negative
// case: `@ts-expect-error` fails the build when the error STOPS happening
// (TS2578: unused directive). Delete the brand and this file goes red.
//
// Four construction routes were probed on 2026-09-22; the results are in
// `evidence/wp7-adapter-contract/05-brand-threat-probe.txt`:
//
//   1. object literal `{ kind, protocol, command, … } as ResolvedCliRuntime`
//        → TS2352, rejected
//   2. same, with a symbol whose NAME we guessed
//        → TS2352, rejected  (the symbol is not recoverable from its name)
//   3. `class X implements the shape` then assign
//        → TS2741, rejected  (the brand key is missing)
//   4. `{ ...real, protocol: 'trylo-v1' }`
//        → COMPILES. This is the gap, and it is guarded at runtime by the
//          factory's pair check rather than by the type system.

import { describe, expect, it } from 'vitest';
import { defineResolvedRuntime, isResolvedCliRuntime } from './cli-runtime-adapter';
import type { ResolvedCliRuntime } from './cli-runtime-adapter';

// ── Route 1: a plain object literal that "looks right" ──────────────────

// @ts-expect-error — the brand key cannot be named from outside the module.
const FORGED_LITERAL = {
  kind: 'legacy',
  protocol: 'legacy-stream-json',
  command: 'C:/attacker/node.exe',
  argsPrefix: [],
  source: 'user',
} as ResolvedCliRuntime;

// ── Route 2: rebuild a symbol from its (known) description ──────────────

const GUESSED = Symbol('trylo.desktop.ResolvedCliRuntime');

// @ts-expect-error — a different symbol is a different key, not the brand.
const FORGED_BY_NAME = {
  [GUESSED]: true,
  kind: 'legacy',
  protocol: 'legacy-stream-json',
  command: 'C:/attacker/node.exe',
  argsPrefix: [],
  source: 'user',
} as ResolvedCliRuntime;

// ── Route 3: a class that satisfies every visible field ─────────────────

class ForgedByClass {
  readonly kind = 'legacy' as const;
  readonly protocol = 'legacy-stream-json' as const;
  readonly command = 'C:/attacker/node.exe';
  readonly argsPrefix: readonly string[] = [];
  readonly source = 'user' as const;
}

// @ts-expect-error — TS2741: property '[RESOLVED_CLI_RUNTIME]' is missing.
const FORGED_BY_CLASS: ResolvedCliRuntime = new ForgedByClass();

// ── Route 4: spread a real value, then overwrite a field ────────────────
//
// NO @ts-expect-error here, deliberately: this one compiles. Recording it
// as a compiling statement is the evidence that the gap is real, and the
// assertion below is what keeps it from reaching a spawn.

const REAL = defineResolvedRuntime({
  kind: 'legacy',
  entryScript: 'C:/trylo-cli/cli.js',
  nodeProgram: 'C:/Program Files/nodejs/node.exe',
  source: 'user',
});
if (!REAL.ok) throw new Error('fixture must build');
const TAMPERED: ResolvedCliRuntime = { ...REAL.runtime, protocol: 'trylo-v1' };

describe('ResolvedCliRuntime brand', () => {
  it('recognises a genuine runtime and nothing else', () => {
    expect(isResolvedCliRuntime(REAL.runtime)).toBe(true);
    // The predicate is the runtime half of the brand: it lets the factory
    // ask "did this come out of defineResolvedRuntime?" without handing
    // anyone the ability to forge the answer.
    expect(isResolvedCliRuntime(FORGED_LITERAL)).toBe(false);
    expect(isResolvedCliRuntime(FORGED_BY_NAME)).toBe(false);
    expect(isResolvedCliRuntime(FORGED_BY_CLASS)).toBe(false);
  });

  it('the spread route keeps the brand but not the invariant', () => {
    // Documented, not celebrated: `spread` carries the symbol along, so
    // provenance passes and only the kind/protocol pair check can catch it.
    expect(isResolvedCliRuntime(TAMPERED)).toBe(true);
    expect(TAMPERED.protocol).not.toBe(REAL.runtime.protocol);
  });

  it('a genuine runtime is frozen', () => {
    expect(Object.isFrozen(REAL.runtime)).toBe(true);
  });
});
