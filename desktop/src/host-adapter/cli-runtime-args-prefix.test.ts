// Trylo Desktop — the argv prefix bridge (P08 §WP7.1 → §WP7.3).
//
// §5.1 makes `argsPrefix` part of the atomic resolution, and §WP7.3 says
// the v1 runner must stop building its own argv and consume
// `command + argsPrefix` instead. Until that switch happens, the fixed
// part of the argv exists in BOTH places — the resolution's
// `argsPrefixOfKind` and `buildTryloV1Args`.
//
// That is a real duplication and this file is the thing that stops it
// from becoming a divergence: it asserts that the fixed prefix the
// resolution publishes is exactly the prefix the current builder emits.
// When WP7.3 makes the builder consume the resolution, this test stays
// green and becomes the proof that no argv changed.

import { describe, expect, it } from 'vitest';
import { argsPrefixOfKind } from './cli-runtime-adapter';
import { buildTryloV1Args } from './trylo-v1-runner';

const CLI = 'C:/work/demo-ws/new trylo cli/dist/cmd/trylo/main.js';
const NODE = 'C:/Program Files/nodejs/node.exe';

describe('argsPrefixOfKind', () => {
  it('legacy has no fixed prefix (a resident process takes frames, not a subcommand)', () => {
    expect(argsPrefixOfKind('legacy')).toEqual([]);
  });

  it('v1 is exactly the fixed head of the argv the current builder emits', () => {
    const { command, args } = buildTryloV1Args({
      cliPath: CLI as never,
      nodeProgram: NODE,
      cwd: 'C:/work/demo-ws/workspace' as never,
      providerId: 'fixture',
    });
    const prefix = argsPrefixOfKind('trylo-v1');
    // The interpreter is the spawn command; the script is its first argv
    // entry. That split is `cliSpawnCommand`'s, and WP7.3 keeps it.
    expect(command).toBe(NODE);
    expect(args[0]).toBe(CLI);
    // …then the fixed prefix, and immediately after it the per-turn part.
    expect(args.slice(1, 1 + prefix.length)).toEqual([...prefix]);
    expect(args[1 + prefix.length]).toBe('--workspace');
  });

  it('the resolution prefix does not contain anything that varies per turn', () => {
    // If `--workspace`, a session flag, a provider or a permission flag
    // ever leaked into the prefix, a second turn would reuse the first
    // turn's cwd or session.
    const prefix = argsPrefixOfKind('trylo-v1');
    for (const forbidden of ['--workspace', '--session', '--resume', '--provider', '--model', '--ask', '-']) {
      expect(prefix).not.toContain(forbidden);
    }
  });
});
