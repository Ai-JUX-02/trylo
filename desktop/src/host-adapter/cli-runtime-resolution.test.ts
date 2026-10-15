// Trylo Desktop — atomic CLI runtime resolution (P08 §WP7.1).
//
// This is the WP7.0 red file for the adapter layer. Before WP7.1 there is
// no resolution module, so the failure it records is a COMPILE failure
// (`TS2307: Cannot find module './cli-runtime-resolution'`), not a failed
// assertion — see evidence/wp7-red/. Every case below is stated against
// the external contract, never against an internal function layout.
//
// The three failure classes the P08 audit found are all represented:
//   1. protocol/executable mismatch (audit P0) — now unexpressible;
//   2. a pinned Node that never reaches the spawn (audit P1);
//   3. an auth/provider bypass at the adapter layer (audit P1).

import { describe, expect, it } from 'vitest';
import type { CliRuntimeResolution as RustResolution } from './cli-runtime-path';
import { LEGACY_RUNTIME_DEFAULT_CLI_PATH } from './cli-runtime-path';
import { selectCliRuntime } from './cli-runtime-resolution';
import { classifyHelpBanner, classifyLegacyVersion } from './cli-runtime-probe';

const V1_DEV: RustResolution = {
  cliScript: 'C:/work/demo-ws/new trylo cli/dist/cmd/trylo/main.js',
  cliSource: 'dev-checkout',
  nodeProgram: 'C:/Program Files/nodejs/node.exe',
  nodeSource: 'system-path',
};

const V1_BUNDLED: RustResolution = {
  cliScript: 'C:/Program Files/Trylo/resources/cli/dist/cmd/trylo/main.js',
  cliSource: 'bundled',
  nodeProgram: 'C:/Program Files/Trylo/resources/runtime/node/win-x64/node.exe',
  nodeSource: 'bundled',
};

describe('selectCliRuntime — protocol × executable', () => {
  it('legacy: the configured path is used verbatim, even with a v1 CLI resolved', () => {
    // Audit P0, moved one layer down. A default legacy conversation must
    // not be re-pointed at the new CLI just because one exists here.
    const result = selectCliRuntime({
      kind: 'legacy',
      configuredPath: LEGACY_RUNTIME_DEFAULT_CLI_PATH,
      resourceResolution: V1_BUNDLED,
    });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.runtime.protocol).toBe('legacy-stream-json');
      expect(result.runtime.entryScript).toBe(LEGACY_RUNTIME_DEFAULT_CLI_PATH);
      expect(result.runtime.nodeProgram).toBeUndefined();
    }
  });

  it('legacy: a custom path is also untouched', () => {
    const result = selectCliRuntime({
      kind: 'legacy',
      configuredPath: 'D:/my/old/cli.js',
      resourceResolution: V1_BUNDLED,
    });
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.runtime.entryScript).toBe('D:/my/old/cli.js');
  });

  it('v1: substitutes the legacy default with the resolved script and its Node', () => {
    const result = selectCliRuntime({
      kind: 'trylo-v1',
      configuredPath: LEGACY_RUNTIME_DEFAULT_CLI_PATH,
      resourceResolution: V1_DEV,
    });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.runtime.protocol).toBe('trylo-v1');
      expect(result.runtime.entryScript).toBe(V1_DEV.cliScript);
      expect(result.runtime.nodeProgram).toBe(V1_DEV.nodeProgram);
      expect(result.runtime.source).toBe('development');
    }
  });

  it('v1: bundled resolution is reported as bundled', () => {
    const result = selectCliRuntime({
      kind: 'trylo-v1',
      configuredPath: '',
      resourceResolution: V1_BUNDLED,
    });
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.runtime.source).toBe('bundled');
  });

  it('bundled runtime missing a script fails typed and never falls back', () => {
    const nothing: RustResolution = { ...V1_BUNDLED, cliScript: null, cliSource: null };
    const result = selectCliRuntime({
      kind: 'trylo-v1',
      configuredPath: '',
      resourceResolution: nothing,
    });
    // The only honest answer is "no entry". Falling back to the other
    // protocol here is exactly the audit's P0 in a new costume.
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.code).toBe('entry_missing');
  });

  it('v1 with a user path probes it instead of guessing from the filename', () => {
    const withoutProbe = selectCliRuntime({
      kind: 'trylo-v1',
      configuredPath: 'D:/somewhere/cli.js',
      resourceResolution: V1_BUNDLED,
      requireProbe: true,
    });
    expect(withoutProbe.ok).toBe(false);
    if (!withoutProbe.ok) expect(withoutProbe.code).toBe('probe_required');

    const withProbe = selectCliRuntime({
      kind: 'trylo-v1',
      configuredPath: 'D:/somewhere/cli.js',
      resourceResolution: V1_BUNDLED,
      requireProbe: true,
      probe: { ok: true, kind: 'trylo-v1', version: '0.0.0', evidence: '--version' },
    });
    expect(withProbe.ok).toBe(true);
    if (withProbe.ok) {
      expect(withProbe.runtime.entryScript).toBe('D:/somewhere/cli.js');
      expect(withProbe.runtime.nodeProgram).toBe(V1_BUNDLED.nodeProgram);
    }
  });

  it('a probe that contradicts the requested kind is a mismatch, not a warning', () => {
    const result = selectCliRuntime({
      kind: 'trylo-v1',
      configuredPath: 'D:/somewhere/cli.js',
      resourceResolution: V1_BUNDLED,
      probe: { ok: true, kind: 'legacy', version: '2.1.88-trylo', evidence: '(Claude Code)' },
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.code).toBe('runtime_mismatch');
  });

  it('a mismatch detail never prints the path it resolved', () => {
    // Diagnostics must not carry a private absolute path (node_runtime.rs
    // §2.3 Task W3). By the time a mismatch is detected the entry may be
    // the RESOLVED one, so the message names neither the configured nor
    // the resolved location — only the banner the probe actually saw.
    const result = selectCliRuntime({
      kind: 'trylo-v1',
      configuredPath: '',
      resourceResolution: V1_BUNDLED,
      probe: { ok: true, kind: 'legacy', version: '2.1.88-trylo', evidence: '(Claude Code)' },
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.detail).not.toContain('Program Files');
      expect(result.detail).not.toContain(V1_BUNDLED.cliScript);
      expect(result.detail).toContain('Claude Code');
    }
  });

  it('a timed-out probe is surfaced, never treated as "fine"', () => {
    const result = selectCliRuntime({
      kind: 'trylo-v1',
      configuredPath: 'D:/somewhere/cli.js',
      resourceResolution: V1_BUNDLED,
      probe: { ok: false, code: 'timeout', detail: 'no output within 2000ms' },
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.code).toBe('probe_timeout');
  });

  it('a probe that found nothing reports the entry as missing, not as a mismatch', () => {
    const result = selectCliRuntime({
      kind: 'legacy',
      configuredPath: 'D:/gone/cli.js',
      resourceResolution: V1_BUNDLED,
      probe: { ok: false, code: 'not_found', detail: 'ENOENT' },
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.code).toBe('entry_missing');
  });

  it('claims a family only on a positive product marker', () => {
    // Real banners, captured 2026-09-22 (evidence/wp7-red/probe-*.txt).
    expect(classifyLegacyVersion('2.1.88-trylo (Claude Code)')).toBe('2.1.88-trylo');
    expect(classifyHelpBanner('trylo - learning agent CLI\n\nUsage:\n  trylo   …')).toBe('trylo-v1');
    expect(classifyHelpBanner('Usage: claude [options] [command] [prompt]\n\nClaude Code - starts…')).toBe(
      'legacy',
    );

    // Anything unrecognised is refused rather than guessed at. The first
    // cut classified v1 by "the banner is a semantic version", which would
    // have accepted ANY CLI printing `1.2.3` and then handed it
    // `run --format stream-json` — the very mismatch §5.1 forbids.
    expect(classifyLegacyVersion('0.0.0')).toBeNull();
    expect(classifyLegacyVersion('')).toBeNull();
    expect(classifyHelpBanner('some unrelated tool 4')).toBeNull();
    expect(classifyHelpBanner('')).toBeNull();
  });
});
