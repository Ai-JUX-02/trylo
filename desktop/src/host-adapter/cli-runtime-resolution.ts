// Trylo Desktop — atomic CLI runtime resolution (P08 §WP7.1 / §5.1).
//
// §5.1 asks for one resolution that answers everything at once, because the
// audit's P0 came from answering it in pieces: the protocol was read from
// settings, the path came from the resource resolver, and nothing checked
// that the two agreed. Here the pair is derived, never supplied.
//
// The rules §5.1 pins, and where each one lives:
//
//   - kind/protocol/command/argsPrefix from ONE resolution
//       → `protocolOfKind` + `defineResolvedRuntime` (cli-runtime-adapter)
//   - controller no longer combines cliPath with cliRuntimeProtocol
//       → `selectCliRuntime` is the only entry (the wiring switch is
//         WP7.4; WP7.1 lands the function and its tests)
//   - a `.js` entry uses the nodeProgram from the SAME resolution
//       → `defineResolvedRuntime` refuses to build without it for v1
//   - bundled runtime missing files ⇒ typed failure, no silent fallback
//       → `entry_missing`
//   - a user-supplied path must be PROBED, never guessed from its name
//       → `requireProbe` + the read-only probe in `cli-runtime-probe.ts`
//   - a resolved turn is unaffected by late async startup effects
//       → the value is frozen and handed to the factory by identity
//
// `requireProbe` defaults to FALSE so WP7.1 changes no user-visible
// behaviour; turning it on for user-supplied v1 paths is WP7.4's job,
// which is why the capability exists here rather than appearing later as
// an untested flag.
//
// THIS FILE IS PURE. It spawns nothing and reads no environment — every
// decision it makes is a function of its input. The spawning half lives in
// `cli-runtime-probe.ts`, so a caller can reason about "which runtime did we
// choose?" without pulling in a process bridge.

import {
  effectiveV1CliPath,
  effectiveLegacyCliPath,
  type CliResolutionSource,
  type CliRuntimeResolution as RustCliRuntimeResolution,
} from './cli-runtime-path';
import {
  defineResolvedRuntime,
  type CliProbeFailureCode,
  type CliRuntimeBuild,
  type CliRuntimeKind,
  type CliRuntimeProbeResult,
  type CliRuntimeSource,
} from './cli-runtime-adapter';


export type CliRuntimeSelectionFailureCode =
  | 'entry_missing'
  | 'missing_node_program'
  | 'probe_required'
  | 'probe_timeout'
  | 'probe_spawn_failed'
  | 'probe_unrecognized'
  | 'runtime_mismatch';

export type CliRuntimeSelectionResult =
  | CliRuntimeBuild
  | {
      readonly ok: false;
      readonly code: CliRuntimeSelectionFailureCode;
      readonly detail: string;
    };

export interface CliRuntimeSelectionInput {
  readonly kind: CliRuntimeKind;
  /** The user's `cliPath`, exactly as stored. Legacy uses it verbatim. */
  readonly configuredPath: string;
  /** What the Rust resource resolver answered on this launch. */
  readonly resourceResolution: RustCliRuntimeResolution | null;
  /**
   * The result of probing `configuredPath`, when one was taken. Supplying
   * a probe that contradicts `kind` is a hard failure — a mismatch is not
   * a warning to print, it is a run that would send the wrong argv.
   */
  readonly probe?: CliRuntimeProbeResult | null;
  /**
   * Demand a probe for a path the user supplied. Off for WP7.1 (no
   * behaviour change); WP7.4 turns it on for the v1 path.
   */
  readonly requireProbe?: boolean;
}

/**
 * Where the entry came from, in §5.1's three-word vocabulary.
 *
 * A path that survived `effectiveV1CliPath` untouched is the user's own
 * choice; a substituted one came from the resolver, and the resolver's
 * own source word tells us which kind of installation it is.
 */
export function runtimeSourceOf(
  substituted: boolean,
  cliSource: CliResolutionSource | null,
): CliRuntimeSource {
  if (!substituted) return 'user';
  switch (cliSource) {
    case 'bundled':
      return 'bundled';
    case 'dev-checkout':
      return 'development';
    default:
      // `env` is an operator override pointing at wherever they put it,
      // which is a user-chosen location by any useful definition.
      return 'user';
  }
}

const PROBE_FAILURE_CODE: Record<CliProbeFailureCode, CliRuntimeSelectionFailureCode> = {
  // "The entry is not there" is the same failure as "nothing resolved":
  // both mean there is no executable to spawn, and both must stay typed.
  not_found: 'entry_missing',
  timeout: 'probe_timeout',
  spawn_failed: 'probe_spawn_failed',
  unrecognized: 'probe_unrecognized',
};

/**
 * Decide, once, which executable this runtime will spawn.
 *
 * Note the asymmetry, which is the whole of audit P0: the legacy branch
 * never consults the resolver, and the v1 branch never uses the configured
 * value when the resolver had an answer and the configured value was a
 * placeholder. Neither branch can see the other's inputs.
 */
export function selectCliRuntime(input: CliRuntimeSelectionInput): CliRuntimeSelectionResult {
  const { kind } = input;

  let entry: string;
  let substituted: boolean;
  let cliSource: CliResolutionSource | null;
  if (kind === 'trylo-v1') {
    const effective = effectiveV1CliPath(input.configuredPath, input.resourceResolution);
    entry = effective.path;
    substituted = effective.substituted;
    cliSource = input.resourceResolution?.cliSource ?? null;
  } else {
    // NOT `effectiveV1CliPath`, not the resolver: the legacy runtime is
    // whatever the user configured, and substituting it is the bug.
    const effective = effectiveLegacyCliPath(input.configuredPath, input.resourceResolution);
    entry = effective.path;
    substituted = effective.substituted;
    cliSource = input.resourceResolution?.legacyCliSource ?? null;
  }

  const source = runtimeSourceOf(substituted, cliSource);
  const probe = input.probe ?? null;

  // A path the user chose is an unknown until it is asked. §5.1 forbids
  // guessing its protocol from the file name, and both CLI families ship
  // an entry called `cli.js`/`main.js`, so a guess would be a coin flip.
  if (input.requireProbe === true && !substituted && probe === null) {
    return {
      ok: false,
      code: 'probe_required',
      detail: `${kind}: ${entry} is user-supplied; its protocol must be probed, not assumed`,
    };
  }

  if (probe !== null) {
    if (!probe.ok) {
      return { ok: false, code: PROBE_FAILURE_CODE[probe.code], detail: probe.detail };
    }
    if (probe.kind !== kind) {
      // Deliberately does NOT name the path: by this point it may be the
      // RESOLVED one, and diagnostics must not print a private absolute
      // path (node_runtime.rs §2.3 Task W3). The evidence field is the
      // banner the probe actually saw, which is what makes this
      // actionable without disclosing where the file lives.
      return {
        ok: false,
        code: 'runtime_mismatch',
        detail: `${kind} was selected, but the executable announces itself as ${probe.kind} (${probe.evidence})`,
      };
    }
  }

  const built = defineResolvedRuntime({
    kind,
    entryScript: entry,
    // The interpreter travels with the script or not at all: for v1 it is
    // the one the resolver found next to the entry, for legacy it is the
    // bare `node` the old runtime has always used.
    ...((kind === 'trylo-v1' || substituted) && input.resourceResolution?.nodeProgram
      ? { nodeProgram: input.resourceResolution.nodeProgram }
      : {}),
    source,
    ...(probe !== null && probe.ok ? { version: probe.version } : {}),
  });
  return built;
}
