// Trylo Desktop — which CLI runtime a Code run talks to (P08 §4.1).
//
// ONE extension point, and it must reach every boundary that decides
// how a process is spawned, shared or reused:
//
//   - persistent settings + migration
//   - the `SettingsForCodeRun` snapshot
//   - the runtime fingerprint
//   - the runner route
//   - the settings UI
//
// The default stays `legacy-stream-json` until release parity passes
// (§4.1: "默认保持 legacy-stream-json，直到发行 parity 通过"). Flipping
// the default is a release decision, not a code change made in passing.

export type CliRuntimeProtocol = 'legacy-stream-json' | 'trylo-v1';

export const CLI_RUNTIME_PROTOCOLS: readonly CliRuntimeProtocol[] = [
  'legacy-stream-json',
  'trylo-v1',
];

/**
 * The shipping default. The new CLI is opt-in for developers only —
 * switching everyone over before M4 parity would turn every unfinished
 * capability into a silent regression.
 */
export const DEFAULT_CLI_RUNTIME_PROTOCOL: CliRuntimeProtocol = 'legacy-stream-json';

export function parseCliRuntimeProtocol(value: unknown): CliRuntimeProtocol | null {
  return value === 'legacy-stream-json' || value === 'trylo-v1' ? value : null;
}

export function isCliRuntimeProtocol(value: unknown): value is CliRuntimeProtocol {
  return parseCliRuntimeProtocol(value) !== null;
}

/**
 * Capability matrix (P08 §3.3): `trylo-v1` is ONE PROCESS PER TURN.
 * Anything that assumes a resident stdin process is off on that path —
 * not degraded, but explicitly unsupported, because faking it produces
 * bugs that look like "the model ignored me".
 */
export interface CliRuntimeCapabilities {
  /** Reuse a live idle CLI for the next turn (legacy warm path). */
  readonly warmReuse: boolean;
  /** Spawn an idle CLI ahead of the first send. */
  readonly prewarm: boolean;
  /** Inject another user frame into a running turn. */
  readonly steering: boolean;
  /**
   * Bidirectional permission/control frames on the prompt stdin.
   * V1 keeps stdin open only in explicit stdio approval mode (ADR 2026-10-03).
   * This does not imply steering or a resident process.
   */
  readonly controlFrames: boolean;
}

const LEGACY_CAPABILITIES: CliRuntimeCapabilities = {
  warmReuse: true,
  prewarm: true,
  steering: true,
  controlFrames: true,
};

const V1_CAPABILITIES: CliRuntimeCapabilities = {
  warmReuse: false,
  prewarm: false,
  steering: false,
  controlFrames: true,
};

export function capabilitiesFor(protocol: CliRuntimeProtocol): CliRuntimeCapabilities {
  return protocol === 'trylo-v1' ? V1_CAPABILITIES : LEGACY_CAPABILITIES;
}

export function supportsWarmReuse(protocol: CliRuntimeProtocol): boolean {
  return capabilitiesFor(protocol).warmReuse;
}

export function supportsPrewarm(protocol: CliRuntimeProtocol): boolean {
  return capabilitiesFor(protocol).prewarm;
}

export function supportsSteering(protocol: CliRuntimeProtocol): boolean {
  return capabilitiesFor(protocol).steering;
}
