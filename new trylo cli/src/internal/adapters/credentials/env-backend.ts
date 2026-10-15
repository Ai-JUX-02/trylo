import type { CredentialProviderId } from "../../ports/credentials.js";
import { resolveEnvCredential, type EnvResolution } from "../../credentials/env-table.js";

/**
 * The read-only environment backend.
 *
 * A thin adapter over the domain's {@link resolveEnvCredential}: it answers
 * "does a declared variable authenticate this provider?" and refuses every
 * mutation. That refusal is the point — an environment variable is the
 * highest-precedence layer but *not* a ledger row, so there is nothing to write,
 * and a `set` here would be a way for a login to be silently shadowed by an
 * environment the user forgot about.
 *
 * It keeps the env layer's *behaviour* (read-only, declared-table-only, injected
 * snapshot rather than the live `process.env`) in one adapter, so the port's
 * resolution stays a pure function and no production path reads the process
 * environment directly.
 */

export type EnvBackend = {
  readonly kind: "env";
  /** The declared value for a provider, or `undefined`. Never throws. */
  resolve(providerId: CredentialProviderId): EnvResolution | undefined;
};

export function createEnvBackend(
  env: Readonly<Record<string, string | undefined>>,
): EnvBackend {
  return {
    kind: "env",
    resolve: (providerId) => resolveEnvCredential(env, providerId),
  };
}
