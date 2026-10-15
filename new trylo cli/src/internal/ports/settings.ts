import type { JsonValue } from "../protocol/envelope.js";
import type { SettingsLayer } from "../settings/layers.js";

/**
 * Settings loading port — the *non-secret* half of configuration.
 *
 * Scope, stated so the boundary is unmissable:
 *
 *  - This port discovers, validates, merges and publicly renders **non-secret**
 *    configuration only. Secrets (`apiKey`, tokens) are the credentials
 *    package's job and are *refused* here, not redacted: a settings file that
 *    contains one is invalid, so the value never enters the resolved config in
 *    the first place.
 *  - `mcpServers` and friends are refused for the same reason — they belong to
 *    the MCP registry, and a settings file must not be able to declare one.
 *  - Loading is read-only. This port never writes a config file.
 *  - Configuration cannot expand permission. Nothing here feeds the
 *    PermissionGate; a resolved value is data, not authority.
 *
 * The dependency on `settings/layers.js` is a type-only import of the pure layer
 * enumeration (no I/O), which keeps the contract acyclic: the settings domain
 * modules implement against these types and never import this port back into a
 * cycle.
 */

/** One layer's contributed key/value pairs, already schema-validated. */
export type SettingsValues = Readonly<Record<string, JsonValue>>;

/** A resolved key: its winning value plus the layer that supplied it. */
export type SettingsEntry = {
  readonly value: JsonValue;
  readonly layer: SettingsLayer;
};

/** Every key that survived the merge, keyed by name. */
export type ResolvedSettings = Readonly<Record<string, SettingsEntry>>;

/**
 * The renderable view. Structurally identical to {@link ResolvedSettings} — the
 * "public" guarantee is not a different shape but the fact that
 * `SettingsPort.publicView` drops any secret/forbidden key before returning, so
 * what comes back is safe to serialize into `config show`, a doctor line or a
 * bug report.
 */
export type SettingsPublicView = Readonly<Record<string, SettingsEntry>>;

export type SettingsFailureCode =
  /** A key the closed schema does not define. */
  | "unknown_key"
  /** `apiKey` / `token` / `authorization` / any key containing `secret`. */
  | "secret_key"
  /** `mcpServers` / `mcp` / `servers` — owned by the MCP registry. */
  | "forbidden_key"
  /** `formatVersion` present and not the one this build reads. */
  | "unknown_format_version"
  /** Bytes that are not a JSON object, or an empty file. */
  | "invalid_json"
  /** A known key whose value fails its type/enum/positive-integer rule. */
  | "invalid_value"
  /** The project candidate resolved outside the workspace root. */
  | "project_path_escape"
  /** The filesystem raised while reading a candidate (not the same as missing). */
  | "read_failed";

export type SettingsFailure = {
  readonly ok: false;
  readonly code: SettingsFailureCode;
  readonly detail: string;
};

export type SettingsOk<T> = { readonly ok: true; readonly value: T };

export type SettingsResult<T> = SettingsOk<T> | SettingsFailure;

export type SettingsLoadRequest = {
  /**
   * Directory holding the system/managed `config.json`. Absent (or `undefined`)
   * means there is no system layer on this machine; that is *missing*, not an
   * error, and the load proceeds without it.
   */
  readonly systemDir?: string | undefined;
  /** The user's home directory; the user layer reads `<home>/.trylo/config.json`. */
  readonly homeDir: string;
  /** The workspace root; the project layer reads `<workspace>/.trylo/config.json`. */
  readonly workspaceDir: string;
  /**
   * Already-parsed CLI flag overrides, highest precedence. Still schema-checked:
   * a flag object cannot smuggle an unknown or secret key past the closed set.
   */
  readonly cliFlag?: SettingsValues | undefined;
};

/**
 * Injected filesystem. `readFile` returns the file text, or `undefined` when the
 * file does not exist. A throw is treated as `read_failed` by the adapter, which
 * is distinct from `undefined` (missing) — a file the user is not allowed to read
 * must not be reported as "not configured".
 */
export type SettingsIo = {
  readonly readFile: (absolutePath: string) => string | undefined;
};

export type SettingsPort = {
  /**
   * Resolve all five layers. Fail-closed: if any present layer is invalid, the
   * whole load fails rather than returning a half-config that quietly dropped the
   * broken layer.
   */
  load(request: SettingsLoadRequest): SettingsResult<ResolvedSettings>;
  /** The sanitized, per-key `{ value, layer }` view. Secret keys never appear. */
  publicView(resolved: ResolvedSettings): SettingsPublicView;
};
