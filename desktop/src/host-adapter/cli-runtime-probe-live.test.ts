// @vitest-environment node
//
// Trylo Desktop — the family classifier, checked against the REAL binaries.
//
// `cli-runtime-probe.test.ts` proves the probe's lifecycle with a mocked
// host. This file closes the remaining gap: it runs the actual CLI
// executables on this machine and feeds their real stdout through the
// same classification the probe uses. Neither side is stubbed, so "the
// new CLI is classified as trylo-v1" is an observation rather than an
// expectation.
//
// It runs on whatever the machine has. Both binaries are checked for on
// disk and the individual cases skip, loudly, when one is absent — a
// checkout without the legacy CLI must not fail this suite, but it must
// not silently claim to have verified it either.

import { describe, expect, it } from 'vitest';
import { execFileSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
import { selectCliRuntime } from './cli-runtime-resolution';
import {
  classifyHelpBanner,
  classifyLegacyVersion,
  probeResultOfBanners,
} from './cli-runtime-probe';
import type { CliRuntimeResolution as RustResolution } from './cli-runtime-path';
import { LEGACY_RUNTIME_DEFAULT_CLI_PATH } from './cli-runtime-path';

/**
 * Derived from THIS FILE's location, never hard-coded.
 *
 * The repo root is three levels up (`…/trylo/desktop/src/host-adapter/`).
 * Writing `C:/work/demo-ws/…` literally would be the same defect the P08 audit
 * called out in `cli-runtime-path.ts` — "a path that exists on exactly one
 * machine" — and it would make this file fail on any other checkout.
 */
const REPO_ROOT = fileURLToPath(new URL('../../..', import.meta.url));
const V1_ENTRY = join(REPO_ROOT, 'new trylo cli', 'dist', 'cmd', 'trylo', 'main.js');
const LEGACY_ENTRY = join(REPO_ROOT, 'trylo cli', 'cli.js');

function run(entry: string, flag: string): string {
  return execFileSync(process.execPath, [entry, flag], { encoding: 'utf8', timeout: 60000 }).trim();
}

const hasV1 = existsSync(V1_ENTRY);
const hasLegacy = existsSync(LEGACY_ENTRY);

describe('classification against the real binaries', () => {
  it.skipIf(!hasV1)('classifies the new CLI as trylo-v1 from its help banner', () => {
    const version = run(V1_ENTRY, '--version');
    const help = run(V1_ENTRY, '--help');
    // A bare version number is deliberately NOT evidence of the family.
    expect(classifyLegacyVersion(version)).toBeNull();
    expect(classifyHelpBanner(help)).toBe('trylo-v1');
    const probe = probeResultOfBanners({ versionBanner: version, helpBanner: help, exitCode: 0 });
    expect(probe.ok).toBe(true);
    if (probe.ok) expect(probe.kind).toBe('trylo-v1');
  });

  it.skipIf(!hasLegacy)('classifies the legacy CLI as legacy from its version banner', () => {
    const version = run(LEGACY_ENTRY, '--version');
    expect(classifyLegacyVersion(version)).toBe('2.1.88-trylo');
    const probe = probeResultOfBanners({ versionBanner: version, exitCode: 0 });
    expect(probe.ok).toBe(true);
    if (probe.ok) expect(probe.kind).toBe('legacy');
  });

  // Skipped on a checkout that has neither binary — and reported as a SKIP,
  // which is visible in the run summary. Asserting "at least one exists"
  // would fail an unrelated machine, and a suite that fails for reasons
  // outside its subject is a suite people learn to ignore.
  it.skipIf(!hasV1 && !hasLegacy)('records which binaries this run actually observed', () => {
    // eslint-disable-next-line no-console
    console.log(`[wp7] live classification: v1=${String(hasV1)} legacy=${String(hasLegacy)}`);
    expect(hasV1 || hasLegacy).toBe(true);
  });
});

/**
 * The end-to-end walkthrough: a real path on this machine, the real
 * banners it prints, and the runtime the selection produces from it.
 *
 * This is the WP7.1 version of the audit's P0 scenario, run against the
 * files that actually exist here rather than against fixtures — if the
 * legacy branch ever started consulting the resolver again, the first
 * case below would show the new CLI's path where the old one belongs.
 */
describe('end-to-end resolution against the real checkouts', () => {
  const RUST_V1: RustResolution = {
    cliScript: V1_ENTRY,
    cliSource: 'dev-checkout',
    nodeProgram: process.execPath,
    nodeSource: 'system-path',
  };

  it('legacy: keeps the configured entry even though a new CLI is right there', () => {
    const result = selectCliRuntime({
      kind: 'legacy',
      configuredPath: LEGACY_RUNTIME_DEFAULT_CLI_PATH,
      resourceResolution: RUST_V1,
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    // eslint-disable-next-line no-console
    console.log(
      `[wp7] legacy → protocol=${result.runtime.protocol} command=${result.runtime.command} entry=${String(result.runtime.entryScript)}`,
    );
    expect(result.runtime.protocol).toBe('legacy-stream-json');
    expect(result.runtime.entryScript).toBe(LEGACY_RUNTIME_DEFAULT_CLI_PATH);
    expect(result.runtime.entryScript).not.toBe(V1_ENTRY);
  });

  it('v1: substitutes the legacy default and carries the interpreter', () => {
    const result = selectCliRuntime({
      kind: 'trylo-v1',
      configuredPath: LEGACY_RUNTIME_DEFAULT_CLI_PATH,
      resourceResolution: RUST_V1,
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    // eslint-disable-next-line no-console
    console.log(
      `[wp7] v1 → protocol=${result.runtime.protocol} command=${result.runtime.command} prefix=${result.runtime.argsPrefix.join(' ')}`,
    );
    expect(result.runtime.entryScript).toBe(V1_ENTRY);
    expect(result.runtime.nodeProgram).toBe(process.execPath);
    expect(result.runtime.argsPrefix).toEqual(['run', '--format', 'stream-json']);
  });

  it.skipIf(!hasV1)('a user-supplied v1 path is accepted only after the real probe agrees', () => {
    const probe = probeResultOfBanners({
      versionBanner: run(V1_ENTRY, '--version'),
      helpBanner: run(V1_ENTRY, '--help'),
      exitCode: 0,
    });
    const result = selectCliRuntime({
      kind: 'trylo-v1',
      configuredPath: V1_ENTRY,
      resourceResolution: RUST_V1,
      requireProbe: true,
      probe,
    });
    expect(probe.ok).toBe(true);
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.runtime.source).toBe('user');
  });

  it.skipIf(!hasLegacy)('a legacy binary offered to the v1 selector is refused, not run', () => {
    const probe = probeResultOfBanners({
      versionBanner: run(LEGACY_ENTRY, '--version'),
      // The positive legacy version marker settles the production probe.
      // Do not initialize the legacy help runtime merely to ignore its banner.
      exitCode: 0,
    });
    const result = selectCliRuntime({
      kind: 'trylo-v1',
      configuredPath: LEGACY_ENTRY,
      resourceResolution: RUST_V1,
      requireProbe: true,
      probe,
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.code).toBe('runtime_mismatch');
  });
});
