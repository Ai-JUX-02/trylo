/**
 * The CLI's own version, stated once.
 *
 * It reaches three places that must never disagree: `trylo version` / `--help`,
 * and the client info both MCP transports introduce themselves with. Before this
 * constant each site spelled its own `"0.0.0"`, so bumping the package left the
 * CLI reporting a version nobody ships.
 *
 * It is a literal rather than a read of `package.json` on purpose: `adapters/**`
 * may import `protocol/**` but must not start reading files, and the one thing a
 * literal needs — a guard against drifting from the package — is what
 * `version.test.ts` is for.
 */
export const TRYLO_VERSION = "0.1.0";
