// Trylo Desktop — `settingsForCodeRun` combination contract (P08 audit P0).
//
// The audit's P0 was a real bug: the CLI path was resolved from the
// resource resolver UNCONDITIONALLY, so a default `legacy-stream-json`
// conversation got pointed at the new CLI and was then handed the legacy
// argv (`-p --input-format …`), which the new CLI rejects with
// `unknown command: -p`.
//
// The lesson is that the path decision is a *combination* of two
// independent facts — which protocol the run speaks, and what the
// resolver found — and neither one alone is enough. These tests exist so
// that mistake cannot come back: they cover the four quadrants the audit
// asked for, and they assert the legacy quadrant even when a new CLI IS
// present on the machine (the exact case that broke).

import { afterEach, describe, expect, it } from 'vitest';
import { settingsForCodeRun } from './conversation-run-supervisor';
import {
  resetCliRuntimeResolution,
  setCliRuntimeResolution,
} from './cli-runtime-resolution';
import { LEGACY_RUNTIME_DEFAULT_CLI_PATH } from '../host-adapter/cli-runtime-path';
import type { FilePath } from '../host-adapter/types';

const CWD = 'C:/trylo-workspace/workspace' as FilePath;

/** What the resolver returns on a machine that HAS the new CLI bundled. */
const BUNDLED = {
  cliScript: 'C:/Program Files/Trylo/resources/cli/dist/cmd/trylo/main.js',
  cliSource: 'bundled' as const,
  nodeProgram: 'C:/Program Files/Trylo/resources/runtime/node/win-x64/node.exe',
  nodeSource: 'bundled' as const,
};

/** What it returns from a dev checkout. */
const DEV_CHECKOUT = {
  cliScript: 'C:/trylo-workspace/new trylo cli/dist/cmd/trylo/main.js',
  cliSource: 'dev-checkout' as const,
  nodeProgram: 'C:/Program Files/nodejs/node.exe',
  nodeSource: 'system-path' as const,
};

afterEach(() => {
  resetCliRuntimeResolution();
});

describe('settingsForCodeRun — protocol × path resolution', () => {
  it('legacy default: keeps the legacy path even when a new CLI is resolved', () => {
    // THE regression test for audit P0. A default configuration must not
    // be re-pointed at the new CLI just because one happens to exist.
    setCliRuntimeResolution(BUNDLED);
    const snapshot = settingsForCodeRun(
      { cliPath: LEGACY_RUNTIME_DEFAULT_CLI_PATH, cliRuntimeProtocol: 'legacy-stream-json' },
      CWD,
    );
    expect(snapshot.cliPath).toBe(LEGACY_RUNTIME_DEFAULT_CLI_PATH);
    expect(snapshot.cliRuntimeProtocol).toBe('legacy-stream-json');
    // A pinned Node belongs to the v1 runtime; the legacy CLI has its own.
    expect(snapshot.cliNodeProgram).toBeUndefined();
  });

  it('legacy custom path: untouched', () => {
    setCliRuntimeResolution(BUNDLED);
    const snapshot = settingsForCodeRun(
      { cliPath: 'D:/my/old/cli.js', cliRuntimeProtocol: 'legacy-stream-json' },
      CWD,
    );
    expect(snapshot.cliPath).toBe('D:/my/old/cli.js');
    expect(snapshot.cliNodeProgram).toBeUndefined();
  });

  it('uses the new CLI and its pinned Node when the protocol is absent', () => {
    setCliRuntimeResolution(BUNDLED);
    const snapshot = settingsForCodeRun({ cliPath: LEGACY_RUNTIME_DEFAULT_CLI_PATH }, CWD);
    expect(snapshot.cliRuntimeProtocol).toBe('trylo-v1');
    expect(snapshot.cliPath).toBe(BUNDLED.cliScript);
    expect(snapshot.cliNodeProgram).toBe(BUNDLED.nodeProgram);
  });

  it('v1 + dev checkout: uses the resolved script and its Node', () => {
    setCliRuntimeResolution(DEV_CHECKOUT);
    const snapshot = settingsForCodeRun(
      { cliPath: LEGACY_RUNTIME_DEFAULT_CLI_PATH, cliRuntimeProtocol: 'trylo-v1' },
      CWD,
    );
    expect(snapshot.cliPath).toBe(DEV_CHECKOUT.cliScript);
    expect(snapshot.cliNodeProgram).toBe(DEV_CHECKOUT.nodeProgram);
  });

  it('v1 + bundled: uses the packaged script and the pinned Node', () => {
    setCliRuntimeResolution(BUNDLED);
    const snapshot = settingsForCodeRun(
      { cliPath: '', cliRuntimeProtocol: 'trylo-v1' },
      CWD,
    );
    expect(snapshot.cliPath).toBe(BUNDLED.cliScript);
    expect(snapshot.cliNodeProgram).toBe(BUNDLED.nodeProgram);
  });

  it('v1 with a user-set path: keeps it, and still pairs it with a Node', () => {
    setCliRuntimeResolution(BUNDLED);
    const snapshot = settingsForCodeRun(
      { cliPath: 'D:/my/new/cli.js', cliRuntimeProtocol: 'trylo-v1' },
      CWD,
    );
    expect(snapshot.cliPath).toBe('D:/my/new/cli.js');
    expect(snapshot.cliNodeProgram).toBe(BUNDLED.nodeProgram);
  });

  it('v1 with no resolution: keeps the configured value, invents nothing', () => {
    // The path may be wrong for v1, but an empty string would turn "CLI
    // not found" into a mysterious spawn failure.
    const snapshot = settingsForCodeRun(
      { cliPath: LEGACY_RUNTIME_DEFAULT_CLI_PATH, cliRuntimeProtocol: 'trylo-v1' },
      CWD,
    );
    expect(snapshot.cliPath).toBe(LEGACY_RUNTIME_DEFAULT_CLI_PATH);
    expect(snapshot.cliNodeProgram).toBeUndefined();
  });

  it('never leaks a pinned Node into the legacy snapshot under any resolution', () => {
    for (const resolution of [BUNDLED, DEV_CHECKOUT]) {
      setCliRuntimeResolution(resolution);
      for (const cliPath of ['', LEGACY_RUNTIME_DEFAULT_CLI_PATH, 'D:/x/cli.js']) {
        const snapshot = settingsForCodeRun(
          { cliPath, cliRuntimeProtocol: 'legacy-stream-json' },
          CWD,
        );
        expect(snapshot.cliNodeProgram).toBeUndefined();
        expect(snapshot.cliPath).toBe(cliPath);
      }
    }
  });
});


it('an explicit legacy choice resolves its own entry and pinned Node, never the v1 entry', () => {
  const legacy = { ...BUNDLED, legacyCliScript: 'C:/Program Files/Trylo/cli-legacy/cli.cjs',
    legacyCliSource: 'bundled' as const };
  setCliRuntimeResolution(legacy);
  for (const cliPath of ['', LEGACY_RUNTIME_DEFAULT_CLI_PATH, 'C:/trylo-cli/cli.js']) {
    const snapshot = settingsForCodeRun({ cliPath: cliPath as FilePath, cliRuntimeProtocol: 'legacy-stream-json' }, CWD);
    expect(snapshot.cliPath).toBe(legacy.legacyCliScript);
    expect(snapshot.cliRuntimeProtocol).toBe('legacy-stream-json');
    expect(snapshot.cliNodeProgram).toBe(legacy.nodeProgram);
  }
  const custom = settingsForCodeRun({ cliPath: 'D:/custom/cli.js' as FilePath }, CWD);
  expect(custom.cliPath).toBe('D:/custom/cli.js');
});
