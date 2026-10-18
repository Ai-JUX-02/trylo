// Trylo Desktop — CLI path resolution tests (P08 §WP6).

import { describe, expect, it, vi } from 'vitest';

vi.mock('@tauri-apps/api/core', () => ({ invoke: vi.fn() }));

const {
  LEGACY_RUNTIME_DEFAULT_CLI_PATH,
  describeCliResolution,
  effectiveV1CliPath,
  cliSpawnCommand,
} = await import('./cli-runtime-path');
type CliRuntimeResolution = import('./cli-runtime-path').CliRuntimeResolution;

describe('cliSpawnCommand Windows resource paths', () => {
  it('converts a verbatim drive script path to a Node-compatible argument', () => {
    expect(cliSpawnCommand('\\\\?\\C:\\Trylo resources\\cli\\main.js', 'C:\\Trylo\\node.exe')).toEqual({
      command: 'C:\\Trylo\\node.exe', prefix: ['C:\\Trylo resources\\cli\\main.js'],
    });
  });
  it('preserves UNC host and share when converting a verbatim script path', () => {
    expect(cliSpawnCommand('\\\\?\\UNC\\server\\share\\main.js').prefix).toEqual(['\\\\server\\share\\main.js']);
  });
  it('leaves executable commands and ordinary script paths intact', () => {
    expect(cliSpawnCommand('\\\\?\\C:\\Trylo\\trylo.exe')).toEqual({ command: '\\\\?\\C:\\Trylo\\trylo.exe', prefix: [] });
    expect(cliSpawnCommand('/opt/trylo/main.mjs').prefix).toEqual(['/opt/trylo/main.mjs']);
  });
});

const RESOLVED: CliRuntimeResolution = {
  cliScript: 'C:/Program Files/Trylo/resources/cli/dist/cmd/trylo/main.js',
  cliSource: 'bundled',
  nodeProgram: 'C:/Program Files/Trylo/resources/runtime/node/win-x64/node.exe',
  nodeSource: 'bundled',
};

describe('effectiveV1CliPath', () => {
  it('never overwrites a path the user configured', () => {
    // §12: migrations must be additive. A user who pointed at their own
    // CLI keeps it, even when the bundled copy exists.
    const result = effectiveV1CliPath('D:/my/own/cli.js', RESOLVED);
    expect(result).toEqual({ path: 'D:/my/own/cli.js', substituted: false });
  });

  it('replaces the hard-coded development default', () => {
    // This is the actual WP6 defect: a default that only exists on one
    // machine.
    const result = effectiveV1CliPath(LEGACY_RUNTIME_DEFAULT_CLI_PATH, RESOLVED);
    expect(result.path).toBe(RESOLVED.cliScript);
    expect(result.substituted).toBe(true);
  });

  it('fills in a resolved path when nothing is configured', () => {
    expect(effectiveV1CliPath('', RESOLVED)).toEqual({
      path: RESOLVED.cliScript,
      substituted: true,
    });
    expect(effectiveV1CliPath(undefined, RESOLVED).substituted).toBe(true);
  });

  it('keeps the configured value when the resolver found nothing', () => {
    // An empty string downstream would turn "not installed" into a
    // mysterious spawn failure. Keeping the path makes the error name it.
    const result = effectiveV1CliPath(LEGACY_RUNTIME_DEFAULT_CLI_PATH, null);
    expect(result.path).toBe(LEGACY_RUNTIME_DEFAULT_CLI_PATH);
    expect(result.substituted).toBe(false);
  });

  it('treats a whitespace-only configuration as unset', () => {
    expect(effectiveV1CliPath('   ', RESOLVED).path).toBe(RESOLVED.cliScript);
  });

  it('does not substitute when resolution succeeded but found no script', () => {
    const nothing: CliRuntimeResolution = { ...RESOLVED, cliScript: null, cliSource: null };
    expect(effectiveV1CliPath(LEGACY_RUNTIME_DEFAULT_CLI_PATH, nothing).path).toBe(LEGACY_RUNTIME_DEFAULT_CLI_PATH);
  });
});

describe('describeCliResolution', () => {
  it('names the source without leaking the absolute path', () => {
    const text = describeCliResolution(RESOLVED);
    expect(text).toContain('打包资源');
    expect(text).not.toContain('Program Files');
  });

  it('says what to do when the CLI is missing', () => {
    const text = describeCliResolution({ ...RESOLVED, cliScript: null, cliSource: null });
    expect(text).toContain('未找到');
  });

  it('distinguishes the dev checkout from a packaged build', () => {
    expect(
      describeCliResolution({ ...RESOLVED, cliSource: 'dev-checkout' }),
    ).toContain('开发 checkout');
  });
});
