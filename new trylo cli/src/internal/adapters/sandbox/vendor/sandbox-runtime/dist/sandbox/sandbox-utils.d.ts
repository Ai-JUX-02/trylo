/**
 * Dangerous files that should be protected from writes.
 * These files can be used for code execution or data exfiltration.
 */
export declare const DANGEROUS_FILES: readonly [".gitconfig", ".gitmodules", ".bashrc", ".bash_profile", ".zshrc", ".zprofile", ".profile", ".ripgreprc", ".mcp.json"];
/**
 * Dangerous directories that should be protected from writes.
 * These directories contain sensitive configuration or executable files.
 */
export declare const DANGEROUS_DIRECTORIES: readonly [".git", ".vscode", ".idea"];
/**
 * Get the list of dangerous directories to deny writes to.
 * Excludes .git since we need it writable for git operations -
 * instead we block specific paths within .git (hooks and config).
 */
export declare function getDangerousDirectories(): string[];
/**
 * Normalizes a path for case-insensitive comparison.
 * This prevents bypassing security checks using mixed-case paths on case-insensitive
 * filesystems (macOS/Windows) like `.cLauDe/Settings.locaL.json`.
 *
 * We always normalize to lowercase regardless of platform for consistent security.
 * @param path The path to normalize
 * @returns The lowercase path for safe comparison
 */
export declare function normalizeCaseForComparison(pathStr: string): string;
/**
 * Check if a path pattern contains glob characters
 */
export declare function containsGlobChars(pathPattern: string): boolean;
/**
 * Windows-specific glob-char check. `[` and `]` are NOT
 * metachars here — they are legal in Win32 filenames, so a
 * literal `C:\app\[prod].env` must route to the literal-path
 * branch, not glob expansion (where it would match nothing and
 * be silently dropped). Only `*` and `?` trigger expansion.
 */
export declare function containsGlobCharsWin(p: string): boolean;
/**
 * Strip the Win32 `\\?\` extended-path prefix so the residue is
 * a conventional absolute path (drive-letter or UNC) with no `?`
 * for the glob-char check to misclassify. `\\?\UNC\srv\share\f`
 * → `\\srv\share\f`; `\\?\C:\f` → `C:\f`; anything else → input.
 * The UNC marker is matched case-insensitively (Windows accepts
 * `\\?\unc\…` in any casing; a case-sensitive check would fall
 * through to the 4-char strip and yield a cwd-relative residue).
 */
export declare function stripExtendedPathPrefix(p: string): string;
/**
 * True for a Windows UNC path in any spelling — `\\server\share\…`,
 * extended-length `\\?\UNC\server\share\…`, device-namespace
 * `\\.\UNC\server\share\…` (all any casing, either separator).
 * Delegates path-form normalization to
 * `path.win32.toNamespacedPath` — every UNC spelling canonicalizes
 * to `\\?\UNC\…` — so the check is "namespaced form starts with
 * `\\?\UNC\` (or `\\.\UNC\`)". Drive-local forms (`C:\…`,
 * `\\?\C:\…`), other device paths (`\\.\pipe\…`), relative paths
 * (resolved against a local cwd), and server-only `\\srv` (no
 * share) are all false.
 *
 * The broker uses this to skip `stat`/`realpath` on UNC **literals**
 * (see {@link normalizePathForSandbox}): any such call is an SMB
 * request carrying the **real user's** NTLM credentials to whatever
 * host the path names — a forced-auth / path-encoded-exfil channel
 * if the path is model-influenced. Literals pass through raw
 * (resolution failures surface at `srt-win` stamp/grant time); a
 * UNC **glob** still walks the share with real-user credentials —
 * the user consented by naming their own share in the config.
 * Defense-in-depth: the primary embedder already gates
 * model-provided cwd/paths upstream.
 */
export declare function isUncPath(p: string): boolean;
/**
 * Remove trailing /** glob suffix from a path pattern
 * Used to normalize path patterns since /** just means "directory and everything under it"
 */
export declare function removeTrailingGlobSuffix(pathPattern: string): string;
/**
 * Check if a symlink resolution crosses expected path boundaries.
 *
 * When resolving symlinks for sandbox path normalization, we need to ensure
 * the resolved path doesn't unexpectedly broaden the scope. This function
 * returns true if the resolved path is an ancestor of the original path
 * or resolves to a system root, which would indicate the symlink points
 * outside expected boundaries.
 *
 * @param originalPath - The original path before symlink resolution
 * @param resolvedPath - The path after fs.realpathSync() resolution
 * @returns true if the resolved path is outside expected boundaries
 */
export declare function isSymlinkOutsideBoundary(originalPath: string, resolvedPath: string): boolean;
/**
 * Expand a leading `~` to the home directory. Handles bare `~`,
 * `~/…`, and (on Windows only) the `~\…` form so callers don't each
 * open-code the variants. `~\` is gated to Windows because `\` is a
 * valid POSIX filename byte — `~\foo` is a legal relative filename
 * on Linux/macOS and must NOT tilde-expand there.
 */
export declare function expandTilde(p: string): string;
/**
 * Expand Windows-style `%USERPROFILE%` / `%HOMEDRIVE%` / `%HOMEPATH%`
 * references to the real user's home directory. Case-insensitive;
 * idempotent. Applied by {@link normalizePathForSandbox}'s Windows
 * pre-processing so every filesystem-config path field
 * (`allowRead`/`allowWrite`/`denyRead`/`denyWrite`) accepts these
 * forms uniformly.
 *
 * `%HOMEPATH%` is drive-RELATIVE (`\Users\name`) and `%HOMEDRIVE%` is
 * the drive-only (`C:`) — the split matches how cmd.exe defines them,
 * so `%HOMEDRIVE%%HOMEPATH%` composes to the full home path.
 */
export declare function expandWindowsEnvRefs(p: string): string;
/**
 * Normalize a path for use in sandbox configurations
 * Handles:
 * - Tilde (~) expansion for home directory
 * - Relative paths (./foo, ../foo, etc.) converted to absolute
 * - Absolute paths remain unchanged
 * - Symlinks are resolved to their real paths for non-glob patterns
 * - Glob patterns preserve wildcards after path normalization
 *
 * Returns the absolute path with symlinks resolved (or normalized glob pattern)
 */
export declare function normalizePathForSandbox(pathPattern: string): string;
/**
 * Get recommended system paths that should be writable for commands to work properly
 *
 * WARNING: These default paths are intentionally broad for compatibility but may
 * allow access to files from other processes. In highly security-sensitive
 * environments, you should configure more restrictive write paths.
 */
export declare function getDefaultWritePaths(): string[];
/**
 * Generate proxy environment variables for sandboxed processes
 */
/**
 * Per-tool trust-store env vars set to the TLS-termination CA cert path so
 * HTTPS clients in the sandboxed child accept proxy-minted certs.
 */
export declare const CA_TRUST_VARS: readonly ["NODE_EXTRA_CA_CERTS", "SSL_CERT_FILE", "CURL_CA_BUNDLE", "REQUESTS_CA_BUNDLE", "PIP_CERT", "GIT_SSL_CAINFO", "AWS_CA_BUNDLE", "CARGO_HTTP_CAINFO", "DENO_CERT", "CLOUDSDK_CORE_CUSTOM_CA_CERTS_FILE", "NIX_SSL_CERT_FILE"];
export declare function generateProxyEnvVars(httpProxyPort?: number, socksProxyPort?: number, caCertPath?: string, proxyAuthToken?: string, skipTmpdir?: boolean, encodedCommand?: string): string[];
/**
 * Build the `GIT_CONFIG_COUNT` / `GIT_CONFIG_KEY_<n>` /
 * `GIT_CONFIG_VALUE_<n>` env-var set for the sandboxed child.
 *
 * Emits:
 *   - `safe.directory=<dir>` for each entry in `safeDirs` (or one
 *     `safe.directory=*` when the list is long) — inside the sandbox
 *     the working tree is owned by a different user (Windows: the
 *     real user vs `srt-sandbox`; Linux: unmapped uid under
 *     `bwrap --unshare-user`), so git refuses with "detected dubious
 *     ownership" without it.
 *   - `http.schannelUseSSLCAInfo=true` and
 *     `http.schannelCheckRevoke=false` when `schannelCa` (Windows
 *     only) — makes git's schannel backend honor `GIT_SSL_CAINFO`
 *     without `-c http.sslBackend=openssl`. Revocation is disabled
 *     because CryptoAPI CRL/OCSP fetches ignore proxy env and would
 *     be WFP-fenced.
 *
 * Composes with an existing `GIT_CONFIG_COUNT` in `baseEnv` by
 * continuing its numbering; the returned `GIT_CONFIG_COUNT` is the
 * new total. `baseEnv` should reflect what the child will actually
 * see: on Windows the two-hop launch means the broker's own
 * `process.env` never reaches the child, so `baseEnv` is the caller
 * overlay (`WindowsSandboxParams.setEnvVars`); on Linux/macOS the
 * child inherits `process.env`, so callers use
 * {@link buildPosixGitSafeDirEnv} (which folds in `process.env`,
 * `unsetEnvVars`, and `setEnvVars`).
 *
 * Paths are emitted with forward slashes so the value survives
 * msys2's env conversion untouched and native git accepts it (a
 * no-op on POSIX paths).
 */
export declare function buildGitConfigEnv(opts: {
    safeDirs: readonly string[];
    /** Windows-only schannel knobs; default false. */
    schannelCa?: boolean;
    baseEnv?: Readonly<Record<string, string | undefined>>;
}): Record<string, string>;
/**
 * POSIX-side wrapper over {@link buildGitConfigEnv} that constructs
 * the correct `baseEnv` for a Linux/macOS sandbox: the child inherits
 * `process.env` under bwrap/sandbox-exec, then `unsetEnvVars` are
 * dropped and `setEnvVars` overlaid — so numbering must continue from
 * whatever `GIT_CONFIG_COUNT` survives that. Shared by
 * `wrapCommandWithSandbox{Linux,MacOS}`.
 */
export declare function buildPosixGitSafeDirEnv(opts: {
    safeDirs: readonly string[];
    unsetEnvVars?: readonly string[];
    setEnvVars?: Readonly<Record<string, string>>;
}): Record<string, string>;
/**
 * Encode a command for sandbox monitoring
 * Truncates to 100 chars and base64 encodes to avoid parsing issues
 */
export declare function encodeSandboxedCommand(command: string): string;
/**
 * Decode a base64-encoded command from sandbox monitoring
 */
export declare function decodeSandboxedCommand(encodedCommand: string): string;
/** Base proxy username; the auth token is the credential, this is a label. */
export declare const PROXY_AUTH_USER = "srt";
/**
 * Build the proxy username for a sandboxed command: `srt.<encodedCommand>`
 * so the proxy can attribute a denial to the invocation that triggered it,
 * or bare `srt` when there is nothing to attribute. RFC 1929 caps the
 * SOCKS5 username at 255 bytes; a multibyte command whose 100-code-unit
 * truncation still base64s past that would fail the SOCKS handshake, so
 * fall back to bare `srt` (attribution is lost, connectivity is not).
 */
export declare function proxyUsernameFor(encodedCommand: string | undefined): string;
/**
 * Inverse of {@link proxyUsernameFor}: extract the encodedCommand suffix
 * from `srt.<encodedCommand>`, or undefined for bare `srt` / anything else.
 * The username is client-controlled inside the sandbox, so a forged suffix
 * can only misattribute a denial in the violation report — it cannot
 * authenticate (the token does that) or reach another command's data.
 */
export declare function encodedCommandFromProxyUser(username: string | undefined): string | undefined;
/**
 * Convert a glob pattern to a regular expression
 *
 * This implements gitignore-style pattern matching to match the behavior of the
 * `ignore` library used by the permission system.
 *
 * Supported patterns:
 * - * matches any characters except / (e.g., *.ts matches foo.ts but not foo/bar.ts)
 * - ** matches any characters including / (e.g., src/**\/*.ts matches all .ts files in src/)
 * - ? matches any single character except / (e.g., file?.txt matches file1.txt)
 * - [abc] matches any character in the set (e.g., file[0-9].txt matches file3.txt)
 *
 * Exported for testing and shared between macOS sandbox profiles and Linux glob expansion.
 */
export declare function globToRegex(globPattern: string): string;
export interface ExpandGlobOptions {
    /**
     * Match case-insensitively. Set this on Windows where the
     * pattern's static prefix may differ in case from what
     * `readdirSync` returns. Default: false (Linux/macOS callers
     * don't need it).
     */
    caseInsensitive?: boolean;
}
/**
 * Expand a glob pattern into concrete file paths.
 *
 * Used on Linux (where bubblewrap doesn't support glob patterns
 * natively) and Windows (point-in-time expansion before `srt-win
 * acl stamp`). Resolves the static directory prefix, lists files
 * recursively, and filters using {@link globToRegex}.
 *
 * @param globPath - A path pattern containing glob characters (e.g., ~/test/*.env)
 * @returns Array of absolute paths matching the glob pattern
 */
export declare function expandGlobPattern(globPath: string, opts?: ExpandGlobOptions): string[];
//# sourceMappingURL=sandbox-utils.d.ts.map