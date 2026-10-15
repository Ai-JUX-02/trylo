// Trylo Desktop — the process-wide CLI runtime resolution (P08 §WP6).
//
// Why a module-level holder instead of threading a parameter through
// four call sites: where the CLI lives is a property of the INSTALLED
// APP, not of a conversation. It is resolved once at startup and read
// wherever a run is built.
//
// Deliberately NOT persisted into settings: the resolved path is
// machine-specific, so storing it would break the moment the app is
// installed elsewhere or bundled differently. The user's own
// `cliPath` stays in settings untouched; this holds only what the
// resource resolver said on THIS launch.

import type { CliRuntimeResolution } from '../host-adapter/cli-runtime-path';

let current: CliRuntimeResolution | null = null;

/** Record this launch's resolution (called once at app startup). */
export function setCliRuntimeResolution(resolution: CliRuntimeResolution | null): void {
  current = resolution;
}

/** This launch's resolution, or null before it is known / on failure. */
export function getCliRuntimeResolution(): CliRuntimeResolution | null {
  return current;
}

/** Test seam: forget the cached resolution. */
export function resetCliRuntimeResolution(): void {
  current = null;
}
