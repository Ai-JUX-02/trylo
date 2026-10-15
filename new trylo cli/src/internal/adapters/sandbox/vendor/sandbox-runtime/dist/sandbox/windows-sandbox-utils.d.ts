export { containsGlobCharsWin, stripExtendedPathPrefix, buildGitConfigEnv, isUncPath, } from './sandbox-utils.js';
import type { SandboxDependencyCheck } from './linux-sandbox-utils.js';
import type { SrtWinConfig } from './sandbox-config.js';
/**
 * Windows sandbox backend.
 *
 * Network isolation is enforced by `srt-win.exe` — a Rust helper that
 * provisions a dedicated `srt-sandbox` local user account, installs a
 * machine-wide WFP filter set keyed on that account's SID, and
 * provides an `exec` subcommand that spawns the target via a two-hop
 * launch (broker → `CreateProcessWithLogonW(runner)` → runner →
 * restricted-token child) under `srt-sandbox`. The sandboxed child
 * reaches the host only via the JS mux proxy, which the caller
 * passes in via `--env`.
 *
 * The separate-user account structurally closes the surrogate-spawn
 * class (schtasks, `PROC_THREAD_ATTRIBUTE_PARENT_PROCESS`, BITS,
 * RunAs="Interactive User" COM): the child's token carries a
 * different user SID, so it cannot reach real-user processes, tasks
 * register under `srt-sandbox`, and the user-SID WFP filter fences
 * `srt-sandbox` egress regardless of how the child was spawned.
 *
 * This module is a thin wrapper around the `srt-win` CLI; all status
 * comes from live enumeration. There is no marker file.
 *
 * Filesystem rules (`denyRead`/`denyWrite`/`allowRead`/`allowWrite`)
 * are enforced via additive explicit ACEs for `<sb-SID>` — see
 * {@link grantWindowsAcl} / {@link stampWindowsAcl}.
 */
/**
 * Stable machine-readable code carried on every
 * {@link WindowsSandboxError}. Consumers branch on `.code` instead of
 * prose-matching `.message` (message text is diagnostic and may change
 * between releases).
 */
export type WindowsSandboxErrorCode = 
/** `windows.srtWin.path` unset, or the configured/packaged exe is missing. */
'srt_win_not_found'
/** `spawnSync(srt-win)` itself failed (ENOENT, EACCES). */
 | 'spawn_failed'
/** `srt-win` was killed by the spawn timeout (generic; see `install_timeout`). */
 | 'srt_win_timeout'
/** A JSON-emitting `srt-win` subcommand exited non-zero. */
 | 'srt_win_nonzero'
/** `srt-win` stdout was not valid JSON. */
 | 'srt_win_bad_json'
/** {@link parseWindowsBinShell} rejected the `binShell` value. */
 | 'bin_shell_invalid'
/** {@link verifyWindowsWfpEgress} could not bind a probe listener. */
 | 'wfp_verify_bind_failed'
/** `srt-win wfp verify` produced no parseable result (timeout/kill). */
 | 'wfp_verify_unparseable'
/** `srt-win wfp verify` proved direct egress SUCCEEDED (fence absent). */
 | 'wfp_fence_inactive'
/** `srt-win wfp verify` was neither `blocked` nor `connected`. */
 | 'wfp_verify_inconclusive'
/** `srt-win user trust-ca` exited non-zero. */
 | 'trust_ca_failed'
/** `tlsTerminate` requested but no CA is installed for the sandbox user. */
 | 'trust_ca_not_installed'
/** Installed CA thumbprint ≠ session CA thumbprint. */
 | 'trust_ca_thumbprint_mismatch'
/** `srt-win install` exit 12 — WFP filter install failed. */
 | 'install_wfp_failed'
/** `srt-win install` exit 14 — sandbox-user provisioning failed. */
 | 'install_user_failed'
/** `srt-win install` exit 13 — different config under this sublayer. */
 | 'install_config_conflict'
/** `srt-win install` exit 17 — ambient write-deny stamping failed. */
 | 'install_ambient_failed'
/** `srt-win install` was killed by the spawn timeout (UAC left open). */
 | 'install_timeout'
/** `srt-win install` failed with an unmapped exit code. */
 | 'install_failed'
/** `srt-win uninstall` exited non-zero (not UAC-cancel). */
 | 'uninstall_failed'
/** `srt-win acl stamp` exited non-zero. */
 | 'acl_stamp_failed'
/** `srt-win acl grant` exited non-zero. */
 | 'acl_grant_failed'
/** `srt-win exec` argv would exceed CreateProcessW's 32 767-char limit. */
 | 'argv_too_long'
/** Sandbox user account / credential not present — run install. */
 | 'not_provisioned'
/**
 * Working directory is on a mapped network drive; the sandbox
 * cannot start (per-user drive mappings don't exist under the
 * sandbox logon). `srt-win exec` exit **16**; parsed from its
 * stderr JSON by {@link parseWindowsSandboxError}, which carries
 * the failing root on `.drive` ({@link MappedDriveCwdError}).
 */
 | 'mapped_drive_cwd';
/**
 * Error thrown by the Windows sandbox backend. Carries a stable
 * {@link WindowsSandboxErrorCode} on `.code` so callers can branch
 * without prose-matching `.message`. `instanceof WindowsSandboxError`
 * narrows `.code` to the union.
 *
 * `.subcommand` is set on errors thrown from the `srt-win` spawn
 * chokepoint (`spawn_failed`, `srt_win_timeout`, `srt_win_nonzero`,
 * `srt_win_bad_json`) to the first CLI arg (e.g. `'install'`,
 * `'wfp'`) so a consumer can distinguish install-spawn-failed from
 * probe-spawn-failed without prose-matching. Unset elsewhere.
 */
export declare class WindowsSandboxError extends Error {
    readonly code: WindowsSandboxErrorCode;
    readonly subcommand?: string;
    constructor(code: WindowsSandboxErrorCode, message: string, subcommand?: string);
}
export declare const DEFAULT_WINDOWS_PROXY_PORT_RANGE: readonly [number, number];
/**
 * `cannot-read` is the graceful-degrade state when BFE enumeration
 * is access-denied (it is admin-gated). The non-elevated readiness
 * check is {@link verifyWindowsWfpEgress}, not this enum.
 */
export type WindowsWfpStatus = 'absent' | 'installed' | 'cannot-read';
export interface WindowsWfpStatusResult {
    state: WindowsWfpStatus;
    /** Live filter count from BFE enum; `0` on `cannot-read`. */
    filters: number;
    /** `[low, high]` for the loopback PERMIT, when known. */
    portRange?: [number, number];
    /** Sandbox-user SID read from the first user-keyed filter tag. */
    userSid?: string;
    /**
     * Populated only on `cannot-read` (BFE enumeration is admin-gated;
     * a non-elevated caller can't read it). The non-elevated readiness
     * check is {@link verifyWindowsWfpEgress}, not this enum.
     */
    hint?: string;
}
/**
 * Result of `srt-win wfp verify` on success (exit 0, `blocked`) —
 * see {@link verifyWindowsWfpEgress}. Any other outcome throws, so
 * the tri-state is unobservable on the return path.
 */
export interface WindowsWfpVerifyResult {
    target: string;
    /** Runner's stderr (carries the `BLOCKED (…)` diagnostic line). */
    stderr: string;
}
/**
 * State of the `srt-sandbox` local account that `srt-win install`
 * provisions. The sandboxed child runs **as** this account.
 */
export interface WindowsSandboxUserStatus {
    /** The `srt-sandbox` local account exists. */
    provisioned: boolean;
    /** `S-1-5-21-…` of `srt-sandbox`, when provisioned. */
    sid?: string;
    /** The `sandbox-runtime-users` local group exists. */
    groupExists: boolean;
    /** `S-1-5-21-…` of `sandbox-runtime-users`, when it exists. */
    groupSid?: string;
    inBuiltinUsers: boolean;
    inSandboxGroup: boolean;
    hiddenFromLogon: boolean;
    /**
     * The credential blob (`HKLM\SOFTWARE\sandbox-runtime\Cred`) is
     * present, decryptable, and readable by THIS process. False when
     * not yet written, or when called from inside the sandbox (the
     * Cred key carries an explicit DENY for `sandbox-runtime-users` —
     * machine-scope DPAPI alone is not a confidentiality boundary).
     */
    credPresent: boolean;
    /** Setup marker schema version, when the marker row exists. */
    markerVersion?: number;
    /**
     * The calling (real) user's SID — the broker's identity, surfaced
     * for diagnostics. The DENY-ACE trustee is `srt-sandbox`'s SID
     * ({@link sid}), not this. Always present.
     */
    realUserSid: string;
    /**
     * SHA-1 thumbprint of the install-time CA, when one was
     * installed via `srt-win user trust-ca`. Uppercase hex.
     */
    caCertThumb?: string;
    /** PEM-encoded install-time CA certificate, when present. */
    caCertPem?: string;
}
/**
 * Inner shell to run `command` under, inside the sandbox: the
 * executable to spawn and the flag argv placed between it and the
 * user's command string. `exe` MUST originate from trusted host
 * configuration (user settings / install detection), NEVER from
 * workspace or repository content — the inner shell runs INSIDE the
 * sandbox so an unexpected path is not a sandbox-escape vector, but
 * it would still be an arbitrary-exec footgun if sourced from
 * untrusted input.
 *
 * Construct via {@link parseWindowsBinShell} — it is the SOLE
 * normalizer and the only place validation lives.
 */
export type WindowsBinShell = {
    /** Shell executable to spawn (absolute path when caller-supplied). */
    exe: string;
    /** Argv placed between `exe` and the user's command string. */
    args: readonly string[];
};
/**
 * Sole normalizer from the cross-platform `binShell?: string |
 * WindowsBinShell` surface ({@link SandboxManager.wrapWithSandboxArgv})
 * to a spawnable `{exe, args}` pair. All validation lives here —
 * {@link wrapCommandWithSandboxWindows} consumes the result verbatim.
 *
 * String form: bare token (`'cmd'|'pwsh'|'powershell'`) resolves to
 * the default install; absolute path to `bash.exe`/`sh.exe`/
 * `pwsh.exe`/`powershell.exe`/`cmd.exe` keeps the caller's path with
 * the matching flag shape. Object form: `exe` must be absolute; `args`
 * pass through unchanged. Throws on anything else — no silent
 * fallback to cmd.exe.
 *
 * Uses `path.win32` explicitly so the function (and its unit test)
 * is platform-independent.
 */
export declare function parseWindowsBinShell(raw?: string | WindowsBinShell): WindowsBinShell;
export interface WindowsSandboxParams {
    command: string;
    /** Attribution key encoded for violation correlation; defaults to
     *  `command`. See MacOSSandboxParams.commandId. */
    commandId?: string;
    /**
     * JS HTTP proxy port — fed to `generateProxyEnvVars` for the env
     * overlay. With the in-process proxy this is the mux front-end
     * port (same as `socksProxyPort`).
     */
    httpProxyPort?: number;
    /**
     * JS SOCKS proxy port — fed to `generateProxyEnvVars` for the env
     * overlay. With the in-process proxy this is the mux front-end
     * port (same as `httpProxyPort`).
     */
    socksProxyPort?: number;
    /** Per-session proxy auth token; embedded in proxy env URLs. */
    proxyAuthToken?: string;
    /**
     * `mode: 'mask'` credential env vars — sentinel values the
     * sandboxed child should see in place of the real credentials.
     * Threaded through the `--env` overlay so the runner forwards
     * them into the child's fresh profile env (the broker's own
     * environment never reaches the child, so an `env -u`-style
     * scrub is structurally moot — there is no `unsetEnvVars`).
     * Applied BEFORE the proxy assignments so the sandbox's own
     * proxy plumbing survives even if a caller masks one of those
     * names — same precedence as macOS/Linux.
     */
    setEnvVars?: Readonly<Record<string, string>>;
    /**
     * Per-exec read-deny paths, applied via an additive
     * `(D;OICI;FA;;;<sb-SID>)` ACE under the `srt-win exec`
     * process's own PID and released after the child exits. Same
     * disk-first chokepoint as the session-level
     * {@link stampWindowsAcl}; same fail-closed semantics (exec
     * fails if any path cannot be stamped).
     *
     * Normalized concrete paths — globs expanded by the caller via
     * {@link expandWindowsFsPaths}, the same as session-level.
     * `srt-win exec`'s `canonicalize_ace_targets` hard-fails on a
     * glob (it never expands), so a `*`/`?` reaching this field is
     * a caller bug.
     */
    denyRead?: readonly string[];
    /** Per-exec write-deny paths — see {@link denyRead}. */
    denyWrite?: readonly string[];
    /**
     * Working directory the child starts in. Fed to
     * {@link buildGitConfigEnv} as a `safe.directory` entry so git
     * inside the sandbox accepts the real-user-owned working tree.
     * Default: `process.cwd()`.
     *
     * `srt-win exec` has no `--cwd` flag — the child's working
     * directory is whatever the caller passes as the spawn `{cwd:}`
     * option (broker `current_dir()` → runner `lpCurrentDirectory` →
     * child inherits). This field must match that spawn option so
     * `safe.directory` covers where git actually runs.
     */
    cwd?: string;
    /**
     * Session-level write-granted paths (the resolved
     * `filesystem.allowWrite` set). Each becomes a `safe.directory`
     * entry — see {@link buildGitConfigEnv}.
     */
    allowWrite?: readonly string[];
    /**
     * Explicit `safe.directory` entries (from
     * `SandboxRuntimeConfig.git.safeDirectories`). Unioned with
     * {@link cwd} and {@link allowWrite} into the `safe.directory` set
     * — see {@link buildGitConfigEnv}. Use for the repo top-level when
     * launching from a subdirectory: the top-level must NOT go in
     * `allowWrite`, but git's dubious-ownership check keys on it.
     */
    gitSafeDirectories?: readonly string[];
    /**
     * Path to the TLS-termination trust bundle (the MITM CA + system
     * roots) — fed to {@link generateProxyEnvVars} so the child's
     * `NODE_EXTRA_CA_CERTS` / `CURL_CA_BUNDLE` / `SSL_CERT_FILE` /
     * etc. point at it. Backslashes are normalised to forward slashes
     * before emission so the value survives msys2 env conversion AND
     * is accepted by native tools.
     *
     * The env-var layer covers OpenSSL-backed clients (msys2 curl,
     * openssl-backed git, node, python, cargo). Schannel/.NET clients
     * that read the Windows certificate store exclusively (System32
     * `curl.exe`, `Invoke-WebRequest`, Go-built tools) trust via the
     * separate `srt-win user trust-ca` / {@link windowsTrustCa}
     * install-time write into the sandbox user's `CurrentUser\Root`.
     *
     * The caller is responsible for the sandbox user having read
     * access to this path — `sandbox-manager.ts`'s `initialize()`
     * pushes it into the session's `acl grant` read-set alongside the
     * working-tree grants.
     */
    caCertPath?: string;
    /**
     * Suppress srt-win's informational stderr (progress lines,
     * per-exec-deny summary, seclogon-job note). Actual errors still
     * print. Default `true` — the host surfaces sandbox diagnostics
     * via its own debug log, not the child's stderr stream.
     */
    quiet?: boolean;
    /**
     * Resolved `srt-win` spawn descriptor — from
     * {@link resolveSrtWin}. Omitting it throws (there is no implicit
     * vendor fallback); direct callers must resolve a path first.
     */
    srtWin?: SrtWinSpawn;
    /**
     * Inner shell. Defaults to `parseWindowsBinShell(undefined)`
     * (System32 cmd.exe). The child's post-`args` content is
     * **passthrough** — `&` chains, `"…"`/`'…'` quotes exactly as
     * written. The security boundary is at the OUTER spawn (this argv
     * is spawned with `shell:false`); the inner shell runs INSIDE the
     * sandbox so its metachars are the user's tool. Construct via
     * {@link parseWindowsBinShell}.
     */
    binShell?: WindowsBinShell;
}
/**
 * The srt-win binary packaged with this module
 * (`vendor/srt-win/<arch>/srt-win.exe`, arch from `process.arch`).
 * Pass explicitly as `windows.srtWin.path` if you want the vendored
 * exe — {@link resolveSrtWin} never falls back to it implicitly.
 *
 * WARNING: in a dev checkout this file may live inside your sandbox
 * write grant — a sandboxed process could overwrite it; prefer a
 * binary outside any grant (e.g. your own signed executable).
 */
export declare const VENDORED_SRT_WIN_EXE: string;
/**
 * Locate a built `srt-win.exe` for development/CI. Checks, in order:
 *   1. `<root>/vendor/srt-win/{arch}/srt-win.exe` (prebuilt —
 *      {@link VENDORED_SRT_WIN_EXE}).
 *   2. `<root>/vendor/srt-win-src/target/release/srt-win.exe` (local
 *      `cargo build --release`).
 *
 * `<root>` is {@link repoRoot} — `__dirname/../..`, which resolves to the
 * repo root from `src/sandbox/` and `dist/sandbox/` alike, and to the
 * package root when installed under `node_modules`.
 *
 * This is an explicit helper — nothing calls it as an ambient
 * default. Production callers set `windows.srtWin.path` (their own
 * binary, or {@link VENDORED_SRT_WIN_EXE}); see {@link resolveSrtWin}.
 *
 * @throws if neither candidate exists.
 */
export declare function getSrtWinPath(): string;
/**
 * `argv[1]` sentinel a multicall embedder's dispatcher matches
 * against to route into `srt_win::run_from_args`. Mirrors the Rust
 * `srt_win::SRT_WIN_DISPATCH_ARG1`; the two MUST stay in sync.
 * `run_from_args` strips it before clap, so the standalone binary
 * accepts it harmlessly.
 */
export declare const SRT_WIN_DISPATCH_ARG1 = "--srt-win";
/**
 * Resolved `srt-win` spawn descriptor — the executable to load plus
 * the leading arguments that carry the dispatch sentinel. Threaded
 * to every spawn site so {@link resolveSrtWin} runs once (at
 * `initialize()`) instead of re-`stat`ing on every helper call.
 */
export type SrtWinSpawn = Readonly<{
    exe: string;
    prependArgs: readonly string[];
}>;
/**
 * Resolve the `srt-win` spawn target from config. `cfg.path` is
 * required and used verbatim; {@link SRT_WIN_DISPATCH_ARG1} is
 * prepended so a multicall dispatcher routes on `argv[1]` (the
 * standalone binary strips it harmlessly).
 *
 * The path must be explicit because the packaged exe lives under
 * the package root, which in a dev checkout sits inside the
 * working-tree write grant (a planted `srt-win.exe` there would be
 * spawned as the broker). Callers that want the packaged binary
 * pass {@link VENDORED_SRT_WIN_EXE}.
 *
 * @throws if `cfg.path` is unset or names a missing file.
 */
export declare function resolveSrtWin(cfg?: SrtWinConfig): SrtWinSpawn;
/** Combined result of `srt-win status` — see {@link checkWindowsSandboxStatus}. */
export interface WindowsSandboxStatus {
    user: WindowsSandboxUserStatus;
    wfp: WindowsWfpStatusResult;
}
/**
 * Query sandbox-user provisioning state AND the WFP filter set in a
 * single `srt-win status` spawn — the same objects
 * {@link getWindowsSandboxUserStatus} and {@link getWindowsWfpStatus}
 * return, without paying two subprocess round-trips. Does not require
 * elevation (WFP degrades to `cannot-read` for a non-elevated caller;
 * see {@link WindowsWfpStatusResult.hint}).
 */
export declare function checkWindowsSandboxStatus(opts?: {
    sublayerGuid?: string;
    srtWin?: SrtWinSpawn;
}): WindowsSandboxStatus;
/** Async twin of {@link checkWindowsSandboxStatus}. */
export declare function checkWindowsSandboxStatusAsync(opts?: {
    sublayerGuid?: string;
    srtWin?: SrtWinSpawn;
}): Promise<WindowsSandboxStatus>;
/**
 * Query the WFP filter set under the given sublayer via live BFE
 * enumeration. `installed` means at least one srt-win-tagged
 * `block-user` filter is present. Detection is **tag-based**
 * (providerData JSON); filters installed by other tooling without the
 * tag are not counted.
 *
 * BFE enumeration is admin-gated — a non-elevated caller gets
 * `state:"cannot-read"` with a `hint` (not an error). The
 * non-elevated readiness check is {@link verifyWindowsWfpEgress}.
 *
 * Prefer {@link getWindowsWfpStatusAsync}; this variant
 * `spawnSync`-blocks the event loop.
 */
export declare function getWindowsWfpStatus(opts?: {
    sublayerGuid?: string;
    srtWin?: SrtWinSpawn;
}): WindowsWfpStatusResult;
/** Async twin of {@link getWindowsWfpStatus}. */
export declare function getWindowsWfpStatusAsync(opts?: {
    sublayerGuid?: string;
    srtWin?: SrtWinSpawn;
}): Promise<WindowsWfpStatusResult>;
/**
 * Behavioral proof that the WFP egress fence is active for the
 * sandbox user. Binds a local listener on an ephemeral loopback port
 * outside the WFP loopback-permit range, then spawns `srt-win
 * runner` as the sandbox user (via `CreateProcessWithLogonW`) to
 * attempt a direct TCP connect to it. The WFP block-user filter
 * fires at `ALE_AUTH_CONNECT` — before any packet leaves — so an
 * active fence yields WSAEACCES immediately and a missing fence lets
 * the connect through (the kernel completes the handshake against
 * the listening socket's backlog; no event-loop tick required, so
 * the synchronous `runSrtWin` is safe). Does not require elevation
 * and does not depend on any external host.
 *
 * `initialize()` calls this once per session, so a stale install
 * (sandbox user provisioned but filters since removed) fails closed
 * at session start instead of running every exec with full egress.
 *
 * @param opts.target overrides the probe target (skips the local
 *   listener bind).
 * @param opts.proxyPortRange the WFP loopback-permit range the
 *   listener must avoid. Default
 *   {@link DEFAULT_WINDOWS_PROXY_PORT_RANGE}.
 * @throws on any outcome other than `blocked` (exit 0).
 */
export declare function verifyWindowsWfpEgress(opts?: {
    target?: string;
    proxyPortRange?: readonly [number, number];
    srtWin?: SrtWinSpawn;
}): Promise<WindowsWfpVerifyResult>;
/**
 * Query the sandbox user account's provisioning state. Each field
 * is independently observed so a half-provisioned install (e.g.
 * user exists but credential file missing) is distinguishable.
 * Does not require elevation.
 *
 * Prefer {@link getWindowsSandboxUserStatusAsync}; this variant
 * `spawnSync`-blocks the event loop.
 */
export declare function getWindowsSandboxUserStatus(opts?: {
    srtWin?: SrtWinSpawn;
}): WindowsSandboxUserStatus;
/** Async twin of {@link getWindowsSandboxUserStatus}. */
export declare function getWindowsSandboxUserStatusAsync(opts?: {
    srtWin?: SrtWinSpawn;
}): Promise<WindowsSandboxUserStatus>;
/**
 * Read back the persistent MITM CA the sandbox was installed with
 * (via `srt-win user trust-ca` / {@link windowsTrustCa}).
 * Returns `null` when no CA was installed. The PEM is what `srt-win
 * user status` reconstructs from the DER recorded in the registry.
 *
 * On Windows, `tlsTerminate` requires this CA to be present in the
 * sandbox user's `CurrentUser\Root` (schannel-level trust is an
 * install-time concern, not per-session); the host calls this from
 * `initialize()` to fail early with an actionable message when it
 * isn't.
 *
 * @param status pass an already-fetched
 *   {@link getWindowsSandboxUserStatus} result to avoid a second
 *   `srt-win user status` spawn.
 */
export declare function getWindowsSandboxCaCert(status?: WindowsSandboxUserStatus, opts?: {
    srtWin?: SrtWinSpawn;
}): {
    pem: string;
    thumb: string;
} | null;
/**
 * Install (or replace) the MITM CA in the **sandbox user's**
 * `CurrentUser\Root` and record it in the registry (so
 * {@link getWindowsSandboxCaCert} surfaces its thumbprint + PEM).
 * Thin wrapper around `srt-win user trust-ca <path>`. Does NOT
 * require elevation. Persistent until {@link uninstallWindowsSandbox}
 * deletes the sandbox user's profile.
 *
 * The CA has a separate lifecycle from {@link installWindowsSandbox}
 * — install provisions the account/filters and never touches the CA;
 * call this AFTER install when `tlsTerminate` will be used.
 *
 * @throws when the sandbox user is not provisioned, the file is not a
 *   parseable X.509 certificate, or the registry write into the
 *   sandbox user's hive fails.
 */
export declare function windowsTrustCa(caCertPath: string, opts?: {
    srtWin?: SrtWinSpawn;
}): void;
/** Async twin of {@link windowsTrustCa} — identical argv and errors. */
export declare function windowsTrustCaAsync(caCertPath: string, opts?: {
    srtWin?: SrtWinSpawn;
}): Promise<void>;
/**
 * The machine-wide state directory `%ProgramData%\sandbox-runtime`,
 * mirroring `srt-win`'s `state_db::machine_store_dir()` exactly.
 * Since the registry move it hosts only the managed CA key material
 * (`ca\`), which must stay on the filesystem because the broker's
 * unelevated generate-if-absent self-heal rewrites it; the
 * credential, marker, and CA record live in
 * `HKLM\SOFTWARE\sandbox-runtime`. Created and ACL'd by the
 * elevated `srt-win install`: Administrators own it, BUILTIN\Users
 * have modify, and the sandbox group carries an explicit
 * `(OI)(CI)` DENY.
 */
export declare function windowsStateDir(): string;
/** Result of {@link ensurePersistentWindowsCa}. */
export type WindowsPersistentCa = {
    /**
     * PEM certificate — pass to `createMitmCA({caCertPem, caKeyPem})` so
     * the caller doesn't re-read from disk.
     */
    certPem: string;
    /** PEM private key — see {@link certPem}. */
    keyPem: string;
    /**
     * `cert.pem` on disk (derived from `ca.json`; exists so
     * {@link windowsTrustCa} and diagnostic tooling have a path).
     */
    certPath: string;
    /** `key.pem` on disk (derived from `ca.json`). */
    keyPath: string;
    /** Uppercase-hex SHA-1 (matches `srt-win user status` `caCertThumb`). */
    thumbprint: string;
    /**
     * `true` when this call generated a fresh CA (first run, `force`, or
     * the on-disk pair was invalid/expiring); `false` when the existing
     * on-disk pair was reused.
     */
    generated: boolean;
    /**
     * `true` when this call wrote the CA into the sandbox user's
     * `CurrentUser\Root` (via {@link windowsTrustCa}) — always on
     * `generated`, and on reuse when the sandbox user's installed
     * thumbprint didn't already match. Callers holding a
     * {@link WindowsSandboxUserStatus} fetched before this call should
     * treat its `caCertThumb` as stale when `trusted` is true.
     */
    trusted: boolean;
};
/**
 * Generate-if-absent a persistent MITM CA under
 * `{windowsStateDir()}\ca\` and ensure it is trusted in
 * the sandbox user's `CurrentUser\Root`. Idempotent and unelevated:
 * a second call with a valid on-disk pair returns it with
 * `generated: false`. On the machine store the `ca\` subdir is
 * user-writable by design (BUILTIN\Users modify, inherited from the
 * install-ACL'd store), so this self-heal keeps working without
 * admin rights for every user of the machine.
 *
 * **Storage.** The pair lives in a single `ca.json = {certPem,
 * keyPem}` written atomically (tmp+rename) and re-read after every
 * write, so it is always a matched pair and concurrent brokers
 * converge on whichever rename landed last. `cert.pem`/`key.pem` are
 * derived copies for diagnostic tooling; `ca.json` is the source of
 * truth.
 *
 * **Key custody is broker-side.** The MITM proxy runs as the real
 * user, so the sandbox user never needs to read the key. The `ca/`
 * subdirectory inherits the machine store's `(OI)(CI)` DACL, which
 * carries an explicit `sandbox-runtime-users` DENY (see
 * {@link windowsStateDir}), so `ca.json`/`key.pem` are unreadable
 * from inside the sandbox with no per-file ACL work here. The key
 * IS readable (and replaceable) by other REAL local users — an
 * accepted trade-off of the shared store: the sandbox account is
 * network-confined by SID-keyed WFP filters regardless of who
 * spawns it. The certificate reaches the sandboxed child via the
 * schannel registry write ({@link windowsTrustCa}) and the
 * trust-bundle env vars — never via these files.
 *
 * `SandboxManager.initialize()` calls this on Windows when
 * `tlsTerminate` is enabled without an explicit
 * `caCertPath`/`caKeyPath`, then feeds the returned PEMs to
 * `createMitmCA` — so an embedder gets a stable CA across restarts
 * without orchestrating generation, storage, or trust itself. Explicit
 * paths in config bypass this entirely.
 *
 * @param opts.force regenerate even if a valid pair is on disk.
 * @param opts.status pass an already-fetched
 *   {@link getWindowsSandboxUserStatus} result to skip the
 *   provisioning check and avoid re-spawning `srt-win user status`
 *   for the trust reconcile.
 * @param opts.dir override the CA directory (tests). Default
 *   `windowsStateDir()/ca`.
 * @param opts.regenerateWithinDays regenerate if `notAfter` is within
 *   this many days. Default 30.
 * @throws when the sandbox user is not provisioned (run
 *   {@link installWindowsSandbox} first), or the CA directory cannot
 *   be created.
 */
export declare function ensurePersistentWindowsCa(opts?: {
    force?: boolean;
    status?: WindowsSandboxUserStatus;
    dir?: string;
    regenerateWithinDays?: number;
    srtWin?: SrtWinSpawn;
}): Promise<WindowsPersistentCa>;
export interface WindowsInstallOptions {
    /** WFP sublayer GUID. Omit for srt-win's compile-time default. */
    sublayerGuid?: string;
    /**
     * Loopback PERMIT port range. Must match what
     * `SandboxRuntimeConfig.windows.proxyPortRange` will be set to.
     * Default {@link DEFAULT_WINDOWS_PROXY_PORT_RANGE}.
     */
    proxyPortRange?: readonly [number, number];
    /**
     * Name for the sandbox user account (created if absent, adopted
     * if it already exists as a local user). Default `srt-sandbox`.
     */
    sandboxUser?: string;
    /**
     * Replace an existing install whose configuration differs
     * (different port range or sandbox-user name under the same
     * sublayer). Without this, install refuses with "already
     * installed with different config" rather than silently
     * overwriting.
     */
    force?: boolean;
    /**
     * How long to wait for the self-elevating install subprocess.
     * Default 120 000 ms — the Windows UAC consent dialog auto-
     * dismisses after ~2 minutes, so anything shorter risks killing
     * the subprocess while a legitimate approval is still pending
     * (elevation is not retracted when the parent dies, so a late
     * approval after we've timed out would half-complete).
     */
    timeoutMs?: number;
    /** Resolved `srt-win` spawn descriptor — from {@link resolveSrtWin}. */
    srtWin?: SrtWinSpawn;
}
export interface WindowsInstallResult {
    /** Post-install WFP state. */
    wfp: WindowsWfpStatusResult;
    /** Post-install sandbox-user state. */
    user: WindowsSandboxUserStatus;
    /**
     * `true` if the user dismissed the UAC prompt. Not an error —
     * the install simply didn't happen. Re-run when the user is
     * ready to grant elevation.
     */
    cancelled?: true;
}
/**
 * One-shot install: provisions the `srt-sandbox` user account and
 * installs the user-SID-keyed WFP filter set — all in a single
 * self-elevating process (one UAC prompt). Idempotent; re-running
 * rotates the sandbox user's password.
 *
 * Network for the calling user is **not disrupted**: the filters key
 * on the `srt-sandbox` user's SID, so the broker, services, and
 * every other principal fall through to default-permit. No logout
 * is required.
 *
 * Returns the post-call WFP + sandbox-user state. If the user
 * cancels the UAC prompt this returns `{cancelled: true, …}` rather
 * than throwing — cancellation is a user choice, not an error.
 *
 * Prefer {@link installWindowsSandboxAsync}; this variant
 * `spawnSync`-blocks the event loop for the full UAC-prompt wait
 * (up to `timeoutMs`).
 *
 * @throws on user/WFP creation failure, or if filters already exist
 *   under `sublayerGuid` with a different port range and `force` is
 *   not set.
 */
export declare function installWindowsSandbox(opts?: WindowsInstallOptions): WindowsInstallResult;
/**
 * Async twin of {@link installWindowsSandbox}. Same options, same
 * return type, same throw semantics. The UAC prompt is still modal,
 * but the event loop stays live — spinners keep painting and timers
 * keep firing.
 */
export declare function installWindowsSandboxAsync(opts?: WindowsInstallOptions): Promise<WindowsInstallResult>;
/**
 * Remove the WFP filter set under `sublayerGuid` and the
 * `srt-sandbox` account, its credential file, and the setup marker
 * (one UAC prompt). Idempotent.
 *
 * @returns `{cancelled: true}` if the user dismissed UAC.
 */
export declare function uninstallWindowsSandbox(opts?: {
    sublayerGuid?: string;
    keepUser?: boolean;
    /**
     * How long to wait for the self-elevating uninstall subprocess.
     * Default 120 000 ms — see {@link WindowsInstallOptions.timeoutMs}.
     */
    timeoutMs?: number;
    srtWin?: SrtWinSpawn;
}): {
    cancelled?: true;
};
/**
 * Resolve any Windows filesystem-config path list — `allowRead`/
 * `allowWrite` grants and `denyRead`/`denyWrite` stamps — to
 * concrete paths via the single platform-aware
 * {@link normalizePathForSandbox} chokepoint (Linux/macOS parity:
 * point-in-time expansion at session initialize, not per-exec).
 * Glob patterns are expanded; non-glob paths are normalized and
 * returned 1:1. Directory targets are accepted — the additive
 * sandbox-user ACE carries `(OI)(CI)` so it covers the subtree.
 *
 * Missing literal paths are dropped for `mode: 'grant'` (a grant on
 * nothing is meaningless) but PASSED THROUGH for `mode: 'deny'` —
 * `srt-win acl stamp` materializes a placeholder chain (mkdirs each
 * missing intermediate + creates an empty leaf) and stamps every
 * created component, so the deny lands on the exact target path
 * and the sandbox user cannot create/write/delete it. A trailing
 * `/` or `\` on the raw input means "the target is a directory":
 * the placeholder leaf is created as an empty directory instead of
 * an empty file, so a later `mkdirSync({recursive: true})` on the
 * real path succeeds. Glob results (existing-by-construction) drop
 * on a stat miss regardless of mode: a glob is inherently "match
 * existing".
 *
 * **UNC exception:** a `\\server\share\…` **literal** passes through
 * raw in BOTH modes (no existence probe — see {@link isUncPath});
 * `srt-win` soft-drops a missing UNC deny target rather than
 * materializing a placeholder chain on an SMB share. A UNC **glob**
 * still walks the share (user-trusted).
 */
export declare function expandWindowsFsPaths(patterns: readonly string[], opts?: {
    mode?: 'grant' | 'deny';
}): string[];
/**
 * {@link WindowsSandboxError} narrowed to `mapped_drive_cwd`,
 * carrying the `DRIVE_REMOTE` root that made the launch fail
 * (`Z:\` for a mapped letter, `\\server\share\` for a raw UNC cwd).
 */
export interface MappedDriveCwdError extends WindowsSandboxError {
    readonly code: 'mapped_drive_cwd';
    readonly drive?: string;
}
/**
 * Parse a structured `srt-win exec` error from its stderr. `exec`
 * emits typed launch failures as a single JSON line
 * `{"code":…,"message":…}` alongside a distinct exit code —
 * `mapped_drive_cwd` is exit **16**. Embedders that spawn the
 * `{argv, env}` from {@link wrapCommandWithSandboxWindows} call
 * this on non-zero exit to surface an actionable
 * {@link WindowsSandboxError} instead of a bare status.
 *
 * Returns `undefined` when no typed-error line is present (the
 * common case: exit status is the child's own). Gate on the
 * `srt-win` exit code before calling — the sandboxed child's own
 * stderr is pumped through unchanged, so a child that happened to
 * print a matching JSON line would parse here too.
 */
export declare function parseWindowsSandboxError(stderr: string): MappedDriveCwdError | undefined;
export interface WindowsAclStampOptions {
    /** Paths the sandboxed child must not read. */
    denyRead: readonly string[];
    /** Paths the sandboxed child must not write (read stays allowed). */
    denyWrite: readonly string[];
    /** SID of the dedicated sandbox user — {@link WindowsSandboxUserStatus.sid}. */
    sandboxUserSid: string;
    /** Long-lived host PID the holds are tied to. Default: this process. */
    holderPid?: number;
    /** Resolved `srt-win` spawn descriptor — from {@link resolveSrtWin}. */
    srtWin?: SrtWinSpawn;
}
/**
 * Apply the file-deny ACE set for one host session: an additive
 * `(D;OICI;mask;;;<sb-SID>)` on the target plus a
 * `(D;OICI;FILE_DELETE_CHILD;;;<sb-SID>)` on the parent — no
 * PROTECTED rewrite, no SD snapshot. Idempotent and refcounted via
 * srt-win's `working_aces` table.
 *
 * Inputs are passed verbatim to `srt-win` (which canonicalizes and
 * rejects globs). Callers that accept globs should pre-expand via
 * {@link expandWindowsFsPaths}.
 *
 * @throws on exit ≠ 0 — including exit 2 (one or more inputs
 *   skipped). srt-win stamps the resolvable inputs before exiting
 *   2, so on throw the caller should call {@link restoreWindowsAcl}
 *   to release whatever WAS stamped.
 */
export declare function stampWindowsAcl(opts: WindowsAclStampOptions): void;
/**
 * Per-path outcome from `srt-win acl restore --json` /
 * `revoke --json`. The status set is intentionally loose: the
 * pre-/post- same-user-removal `srt-win` builds emit different
 * vocabularies for `restore` (`restored`/`leftChanged`/… vs
 * `revoked`/`stillHeld`/…). Callers (`reset()`) only log these,
 * so the union is whatever the binary on PATH says.
 */
export interface WindowsAclAceOutcome {
    path: string;
    status: string;
}
/**
 * Release this holder's deny ACEs and remove the sandbox-user ACE
 * on any path whose refcount falls to zero. Best-effort (does not
 * throw on per-path anomalies); returns per-path outcomes for the
 * caller to surface. Returns `undefined` only when `srt-win`
 * itself failed (no JSON to parse).
 */
export declare function restoreWindowsAcl(opts: {
    sandboxUserSid: string;
    holderPid?: number;
    srtWin?: SrtWinSpawn;
}): WindowsAclAceOutcome[] | undefined;
export interface WindowsAclGrantOptions {
    /** Paths to grant `MODIFY_NO_FDC` on (the working tree, `allowWrite`). */
    write: readonly string[];
    /** Paths to grant `FILE_GENERIC_READ|EXECUTE` on (`allowRead`). */
    read: readonly string[];
    /** SID of the dedicated sandbox user — {@link WindowsSandboxUserStatus.sid}. */
    sandboxUserSid: string;
    /** Long-lived host PID the holds are tied to. Default: this process. */
    holderPid?: number;
    /** Resolved `srt-win` spawn descriptor — from {@link resolveSrtWin}. */
    srtWin?: SrtWinSpawn;
}
/**
 * Apply per-session additive `(OI)(CI)` ALLOW ACEs for the sandbox
 * user on each path. The sandbox user has no inherent rights on
 * real-user-owned files; this is what makes the working tree (and
 * explicit `allowRead`/`allowWrite` paths) reachable from the
 * child. Idempotent and refcounted via srt-win's `working_aces`
 * table.
 *
 * @throws on exit ≠ 0. On throw the caller should call
 *   {@link revokeWindowsAcl} to release whatever WAS granted.
 */
export declare function grantWindowsAcl(opts: WindowsAclGrantOptions): void;
/**
 * Release this holder's grants and remove the sandbox-user ACE on
 * any path whose refcount falls to zero. Best-effort (does not
 * throw); logs anomalies.
 */
export declare function revokeWindowsAcl(opts: {
    sandboxUserSid: string;
    holderPid?: number;
    srtWin?: SrtWinSpawn;
}): WindowsAclAceOutcome[] | undefined;
/**
 * Build the spawn descriptor for running `command` inside the Windows
 * sandbox: an `argv` array plus the `env` to spawn it with.
 *
 * Caller MUST spawn the result with `{shell: false}` — that is the
 * security boundary that keeps untrusted bytes off the host's shell
 * (the inner `cmd.exe /c` runs INSIDE the sandbox; see
 * `vendor/srt-win-src/src/launch.rs` `build_cmdline` for the passthrough
 * rationale) — AND with the returned `env`.
 *
 * Proxy configuration is single-sourced by {@link generateProxyEnvVars}
 * (the same canonical builder used on macOS/Linux). `srt-win exec`
 * takes no `--http-proxy` / `--socks-proxy` flags and synthesizes no
 * proxy env. The two-hop runner starts with the SANDBOX user's
 * profile env (`USERPROFILE`/`TEMP` isolated) and overlays exactly
 * what we pass as `--env` — built here from the broker's `PATH` plus
 * the generated proxy set.
 */
export declare function wrapCommandWithSandboxWindows(p: WindowsSandboxParams): {
    argv: string[];
    env: NodeJS.ProcessEnv;
};
/**
 * Install instructions, surfaced verbatim in error messages.
 */
export declare function windowsInstallInstructions(sublayerGuid: string | undefined): string;
/**
 * Check the Windows backend is ready to sandbox. Errors block
 * `initialize()`; warnings are informational.
 *
 * Prefer {@link checkWindowsDependenciesAsync}; this variant
 * `spawnSync`-blocks the event loop on two `srt-win.exe` spawns
 * (Windows Defender cold-scan can add seconds).
 */
export declare function checkWindowsDependencies(opts?: {
    sublayerGuid?: string;
    srtWin?: SrtWinSpawn;
}): SandboxDependencyCheck;
/**
 * Async twin of {@link checkWindowsDependencies}. Same result for the
 * same underlying state; runs the two `srt-win` probes concurrently
 * and never blocks the event loop.
 */
export declare function checkWindowsDependenciesAsync(opts?: {
    sublayerGuid?: string;
    srtWin?: SrtWinSpawn;
}): Promise<SandboxDependencyCheck>;
//# sourceMappingURL=windows-sandbox-utils.d.ts.map