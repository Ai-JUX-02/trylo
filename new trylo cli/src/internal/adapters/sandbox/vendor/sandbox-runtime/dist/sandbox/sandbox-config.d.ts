/**
 * Configuration for Sandbox Runtime
 * This is the main configuration interface that consumers pass to SandboxManager.initialize()
 */
import type { FilterRequestCallback } from './request-filter.js';
import { z } from 'zod';
/**
 * Schema for MITM proxy configuration
 * Allows routing specific domains through an upstream MITM proxy via Unix socket
 */
declare const MitmProxyConfigSchema: z.ZodObject<{
    socketPath: z.ZodString;
    domains: z.ZodArray<z.ZodEffects<z.ZodString, string, string>, "many">;
}, "strip", z.ZodTypeAny, {
    socketPath: string;
    domains: string[];
}, {
    socketPath: string;
    domains: string[];
}>;
/**
 * Schema for upstream/parent HTTP proxy configuration.
 * Used when SRT itself runs behind a corporate proxy and cannot make direct
 * outbound connections.
 */
declare const ParentProxyConfigSchema: z.ZodObject<{
    http: z.ZodOptional<z.ZodString>;
    https: z.ZodOptional<z.ZodString>;
    noProxy: z.ZodOptional<z.ZodString>;
}, "strip", z.ZodTypeAny, {
    http?: string | undefined;
    https?: string | undefined;
    noProxy?: string | undefined;
}, {
    http?: string | undefined;
    https?: string | undefined;
    noProxy?: string | undefined;
}>;
/**
 * Schema for the access mode of a declared credential source.
 *
 * - `deny` — the sandboxed process cannot read the file / does not see the
 *   environment variable.
 * - `mask` — the sandboxed process sees a per-session sentinel value; the
 *   host proxy substitutes sentinel→real on egress to `injectHosts`.
 *   For files this is whole-file masking (Linux only; degrades to `deny`
 *   on macOS — see {@link CredentialFileConfigSchema}).
 */
declare const credentialModeSchema: z.ZodEnum<["deny", "mask"]>;
/**
 * Schema for a single credential file/directory entry.
 *
 * `mode: "mask"` without `extract` is **whole-file** masking: the entire
 * file content is replaced inside the sandbox with one sentinel string,
 * and the proxy substitutes that sentinel back to the real bytes on egress.
 * This works for files whose content *is* the credential (a token file, a
 * single-line secret).
 *
 * `mode: "mask"` with `extract` is **structured** masking: the regex is
 * applied globally to the real file, capture group 1 of each match is a
 * credential value, and only those captured spans are replaced with
 * sentinels — the rest of the file is preserved byte-for-byte. This lets a
 * tool that parses the file (`.netrc`, JSON/YAML configs) still succeed
 * inside the sandbox while the credential values are protected. If the
 * pattern matches nothing, behaviour is governed by `onExtractNoMatch`
 * (default `"warn"` — the file is left readable as-is and a stderr
 * warning is emitted).
 *
 * `mode: "mask"` with `decode: "jwt"` extends structured masking into
 * encoded values: where `extract` opens plain text to mask a span inside
 * it, `decode` opens the encoding so masking can target fields inside the
 * decoded payload (`maskClaims`):
 *
 * - **Default pattern**: when `extract` is absent, a built-in JWT regex is
 *   used (every JWT starts `eyJ` — base64url of `{"`), so authors don't
 *   hand-write it. An explicit `extract` wins; its group-1 captures are the
 *   candidates.
 * - **Decode-verification**: each candidate must actually BE a JWT (three
 *   segments, JSON header/payload, `alg` in the header) before it is
 *   masked; candidates failing verification are left untouched.
 * - **Claim-level masking** (`maskClaims`): each named top-level payload
 *   claim present with a string value is replaced by its own sentinel and
 *   the token is rebuilt around the modified payload (original header,
 *   filler signature). All other claims stay real, so a client that
 *   decodes the token and reads a non-secret claim keeps working. The
 *   proxy substitutes both the whole rebuilt token (sent as a bearer
 *   credential) and each claim sentinel (extracted and sent alone).
 * - **Whole-token fallback** (no `maskClaims`): the whole decoded value is
 *   treated as the credential — for bearer-style usage where the token
 *   itself is the secret — and replaced with a structurally valid fake JWT
 *   (parseable header/payload, far-future `exp`), so client-side token
 *   parsing inside the sandbox doesn't break. Its header declares
 *   `alg: HS256` (not `alg: none`, which misconfigured validators accept)
 *   with a garbage signature, so any validator the unswapped fake reaches
 *   rejects it.
 * - **No verified candidate**: if nothing matches, no candidate verifies,
 *   or (with `maskClaims`) no named claim matches in any verified token,
 *   behaviour is governed by `onExtractNoMatch` — same as a non-matching
 *   `extract` (default `"warn"`: stderr warning, file left readable
 *   as-is).
 *
 * `maskDuplicates: true` (only meaningful with `extract` or `decode`)
 * additionally replaces every verbatim occurrence of each masked value
 * *outside* the regex-matched spans — for a secret repeated where the
 * regex does not reach (e.g. pasted into a comment). The scan is raw
 * substring matching, so a short or common captured value may also hit
 * unrelated content that happens to contain it; intended for long,
 * high-entropy secrets. Composed with `decode`, only captures that passed
 * verification are scanned — a duplicate is the same value and reuses the
 * verified capture's fake without re-verification.
 *
 * On macOS, SBPL cannot redirect reads, so `mode: "mask"` (with or without
 * `extract`/`decode`) currently degrades to `mode: "deny"` (the file is
 * unreadable inside the sandbox).
 */
export declare const CredentialFileConfigSchema: z.ZodObject<{
    path: z.ZodString;
    mode: z.ZodEnum<["deny", "mask"]>;
    extract: z.ZodOptional<z.ZodEffects<z.ZodString, string, string>>;
    /**
     * What to do when `extract` matches nothing in the file at runtime —
     * or, with `decode`, when no candidate survives verification.
     *
     * - `"warn"` (default): emit a stderr warning and leave the file
     *   readable as-is inside the sandbox (fail-open). A non-matching
     *   pattern is treated as a config error to surface and fix, not a
     *   reason to break a tool that needs the file when the credential is
     *   legitimately absent.
     * - `"deny"`: degrade the entry to `mode: "deny"` so the file is
     *   unreadable inside the sandbox (fail-closed). The operator declared
     *   this file as containing a credential; if the regex cannot find it,
     *   block access rather than expose it.
     * - `"error"`: throw at wrap time so nothing runs until the operator
     *   fixes the config.
     *
     * Only meaningful when `mode` is `"mask"` and `extract` or `decode` is
     * set; accepted but ignored otherwise.
     */
    onExtractNoMatch: z.ZodOptional<z.ZodEnum<["warn", "deny", "error"]>>;
    decode: z.ZodOptional<z.ZodEnum<["jwt"]>>;
    /**
     * Names of top-level payload claims to mask inside each decoded value —
     * the claim-level counterpart of `extract`: where `extract` opens plain
     * text to mask a span inside it, `decode` + `maskClaims` opens the
     * encoding to mask a field inside the decoded payload.
     *
     * For each verified JWT candidate, every named claim present with a
     * string value is replaced by its own sentinel and the token is rebuilt
     * around the modified payload (original header, filler signature). All
     * other claims are preserved verbatim, so a tool that decodes the token
     * and reads a non-secret claim (issuer, audience, user id) keeps
     * working while the secret claim is protected. A named claim that is
     * absent or non-string in a given token is skipped. If no named claim
     * matches in any verified token, behaviour is governed by
     * `onExtractNoMatch` — same as no candidate verifying.
     *
     * Requires `decode` (there is no payload to look inside otherwise); an
     * explicitly empty list is rejected — see the superRefine below.
     */
    maskClaims: z.ZodOptional<z.ZodArray<z.ZodString, "many">>;
    maskDuplicates: z.ZodOptional<z.ZodBoolean>;
    injectHosts: z.ZodOptional<z.ZodArray<z.ZodEffects<z.ZodString, string, string>, "many">>;
}, "strip", z.ZodTypeAny, {
    mode: "deny" | "mask";
    path: string;
    extract?: string | undefined;
    onExtractNoMatch?: "error" | "warn" | "deny" | undefined;
    decode?: "jwt" | undefined;
    maskClaims?: string[] | undefined;
    maskDuplicates?: boolean | undefined;
    injectHosts?: string[] | undefined;
}, {
    mode: "deny" | "mask";
    path: string;
    extract?: string | undefined;
    onExtractNoMatch?: "error" | "warn" | "deny" | undefined;
    decode?: "jwt" | undefined;
    maskClaims?: string[] | undefined;
    maskDuplicates?: boolean | undefined;
    injectHosts?: string[] | undefined;
}>;
/**
 * Schema for a single credential environment variable entry.
 *
 * `mode: "mask"` replaces the variable's value inside the sandbox with a
 * per-session sentinel; the proxy substitutes sentinel→real on egress to
 * the credential's injectHosts. A masked var that is unset on the host is
 * skipped — there is nothing to protect.
 *
 * `mode: "mask"` without `extract` is **whole-value** masking: the entire
 * value is replaced inside the sandbox with one sentinel string, and the
 * proxy substitutes that sentinel back to the real value on egress. This
 * works for variables whose value *is* the credential (a bare token).
 *
 * `mode: "mask"` with `extract` is **structured** masking: the regex is
 * applied globally to the real value, capture group 1 of each match is a
 * credential value, and only those captured spans are replaced with
 * sentinels — the rest of the value is preserved byte-for-byte. This lets
 * a tool that parses the value (a `DATABASE_URL` connection string, a
 * composite `KEY:SECRET` pair) still succeed inside the sandbox while the
 * credential spans are protected. If the pattern matches nothing,
 * behaviour is governed by `onExtractNoMatch` (default `"warn"` — the
 * variable passes through unmasked and a stderr warning is emitted).
 *
 * `mode: "mask"` with `decode: "jwt"` handles a variable whose whole value
 * is a JWT (CI OIDC tokens, Supabase keys, ...). `decode` opens the encoded
 * value for masking: without claim-level configuration the entire token is
 * replaced by a structurally valid fake JWT — parseable three-segment shape
 * with JSON header/payload and far-future `exp`, so a tool that inspects
 * the token before sending it (segment count, exp, claims) keeps working.
 * The fake's header declares `alg: HS256` — never `alg: none`, which
 * misconfigured validators accept — with a filler signature, so a verifier
 * the unswapped fake ever reaches rejects it cryptographically. The proxy
 * swaps the whole fake token for the real one on egress.
 *
 * `decode: "jwt"` with `maskClaims` masks at the claim level instead: each
 * named top-level payload claim present with a string value is replaced by
 * its own sentinel and the token is rebuilt around the modified payload
 * (original header segment, filler signature). All other claims stay real,
 * so a client that decodes the token and reads a non-secret claim keeps
 * working. The proxy substitutes both the whole rebuilt token (sent as a
 * bearer credential) and each claim sentinel (extracted and sent alone).
 *
 * If the variable is set but its value does not verify as a JWT — or, with
 * `maskClaims`, no named claim is present as a string — nothing was masked:
 * the entry currently fails open — the real value stays in the sandbox
 * environment and a loud stderr warning names the variable.
 */
export declare const CredentialEnvVarConfigSchema: z.ZodObject<{
    name: z.ZodString;
    mode: z.ZodEnum<["deny", "mask"]>;
    extract: z.ZodOptional<z.ZodEffects<z.ZodString, string, string>>;
    /**
     * What to do when `extract` matches nothing in the value at runtime.
     *
     * - `"warn"` (default): emit a stderr warning and let the variable pass
     *   through unmasked inside the sandbox (fail-open). A non-matching
     *   pattern is treated as a config error to surface and fix, not a
     *   reason to break a tool that needs the variable when the credential
     *   is legitimately absent from it.
     * - `"deny"`: unset the variable inside the sandbox (fail-closed) — the
     *   env analog of degrading a file to `mode: "deny"`. The operator
     *   declared this variable as containing a credential; if the regex
     *   cannot find it, withhold the value rather than expose it.
     * - `"error"`: throw at wrap time so nothing runs until the operator
     *   fixes the regex.
     *
     * Only meaningful when `mode` is `"mask"` and `extract` is set;
     * accepted but ignored otherwise.
     */
    onExtractNoMatch: z.ZodOptional<z.ZodEnum<["warn", "deny", "error"]>>;
    decode: z.ZodOptional<z.ZodEnum<["jwt"]>>;
    /**
     * Names of top-level payload claims to mask inside the decoded value —
     * the env-var counterpart of the `maskClaims` on a file entry: `decode`
     * opens the variable's encoded value so masking can target a field
     * inside the decoded payload instead of replacing the whole token.
     *
     * Every named claim present with a string value is replaced by its own
     * sentinel and the token is rebuilt around the modified payload
     * (original header segment, filler signature). All other claims are
     * preserved verbatim, so a tool that decodes the token and reads a
     * non-secret claim (issuer, audience, user id) keeps working while the
     * secret claim is protected. A named claim that is absent or non-string
     * is skipped. If no named claim matches, nothing was masked and the
     * entry fails open with a stderr warning — same path as a value that
     * does not verify as a JWT.
     *
     * Requires `decode` (there is no payload to look inside otherwise); an
     * explicitly empty list is rejected — see the superRefine below.
     */
    maskClaims: z.ZodOptional<z.ZodArray<z.ZodString, "many">>;
    injectHosts: z.ZodOptional<z.ZodArray<z.ZodEffects<z.ZodString, string, string>, "many">>;
}, "strip", z.ZodTypeAny, {
    mode: "deny" | "mask";
    name: string;
    extract?: string | undefined;
    onExtractNoMatch?: "error" | "warn" | "deny" | undefined;
    decode?: "jwt" | undefined;
    maskClaims?: string[] | undefined;
    injectHosts?: string[] | undefined;
}, {
    mode: "deny" | "mask";
    name: string;
    extract?: string | undefined;
    onExtractNoMatch?: "error" | "warn" | "deny" | undefined;
    decode?: "jwt" | undefined;
    maskClaims?: string[] | undefined;
    injectHosts?: string[] | undefined;
}>;
/**
 * Explicit grouping of masked env vars into an AWS credential pair for
 * SigV4 re-signing.
 *
 * A SigV4 signature is an HMAC derived from the secret access key, so a
 * client signing with a masked (fake) secret produces a signature no
 * substitution can repair — the proxy must re-sign with the real secret.
 * Re-signing needs the access key id, secret, and optional session token
 * *linked* as one credential: this entry names the `credentials.envVars`
 * entries (all `mode: "mask"`, whole-value — no `extract`/`decode`) that
 * hold each part.
 *
 * The conventional trio AWS_ACCESS_KEY_ID / AWS_SECRET_ACCESS_KEY /
 * AWS_SESSION_TOKEN is paired automatically when those vars are masked
 * whole-value and no explicit awsPairs entry references them — this
 * config exists for non-standard variable names.
 *
 * Re-signing triggers only on requests whose signature scope references
 * the pair's fake access key id (exact match); everything else — including
 * requests signed with real, unmasked AWS credentials — is untouched. The
 * substitution gate is the access-key-id entry's `injectHosts` (defaulting
 * to network.allowedDomains); the secret/session-token entries' own
 * injectHosts are not consulted for re-signing.
 */
export declare const AwsPairConfigSchema: z.ZodObject<{
    accessKeyIdVar: z.ZodString;
    secretAccessKeyVar: z.ZodString;
    sessionTokenVar: z.ZodOptional<z.ZodString>;
}, "strict", z.ZodTypeAny, {
    accessKeyIdVar: string;
    secretAccessKeyVar: string;
    sessionTokenVar?: string | undefined;
}, {
    accessKeyIdVar: string;
    secretAccessKeyVar: string;
    sessionTokenVar?: string | undefined;
}>;
/**
 * Per-shape policy for AWS SigV4 request forms the proxy cannot re-sign.
 * Applies only to requests whose signature references a masked pair's
 * fake access key id; requests signed with unmasked credentials are never
 * affected.
 *
 * - `"deny"` (default): fail closed with a 403 naming the case, so the
 *   sandboxed client sees a policy block instead of a confusing upstream
 *   signature error.
 * - `"passthrough"`: forward the request without re-signing. Ordinary
 *   header substitution still applies, but the signature was computed
 *   from the masked placeholder secret, so the upstream will reject it —
 *   set this only when that failure mode is preferable to a proxy denial.
 *
 * Re-signable header-SigV4 requests that sign a literal body hash are
 * buffered (up to 64 MiB — MAX_SIGV4_RESIGN_BODY_BYTES in
 * tls-terminate-proxy.ts) so the hash can be recomputed over the bytes
 * actually forwarded; larger bodies are denied with a 403. Payloads
 * signed as UNSIGNED-PAYLOAD stream through without buffering.
 */
export declare const Sigv4ConfigSchema: z.ZodObject<{
    streaming: z.ZodOptional<z.ZodEnum<["deny", "passthrough"]>>;
    presigned: z.ZodOptional<z.ZodEnum<["deny", "passthrough"]>>;
    sigv4a: z.ZodOptional<z.ZodEnum<["deny", "passthrough"]>>;
}, "strict", z.ZodTypeAny, {
    streaming?: "deny" | "passthrough" | undefined;
    presigned?: "deny" | "passthrough" | undefined;
    sigv4a?: "deny" | "passthrough" | undefined;
}, {
    streaming?: "deny" | "passthrough" | undefined;
    presigned?: "deny" | "passthrough" | undefined;
    sigv4a?: "deny" | "passthrough" | undefined;
}>;
/**
 * Credentials configuration schema for validation.
 *
 * Declares credential sources (files and environment variables) with a
 * per-source mode:
 * - `deny` blocks the source inside the sandbox (file reads are denied via the
 *   filesystem read-deny mechanism, env vars are unset in the child).
 *
 * Additional modes (e.g. `mask`) will be added in future releases.
 *
 * Only the sources declared here are affected; the section applies no
 * implicit restrictions beyond them.
 */
export declare const CredentialsConfigSchema: z.ZodObject<{
    files: z.ZodOptional<z.ZodArray<z.ZodObject<{
        path: z.ZodString;
        mode: z.ZodEnum<["deny", "mask"]>;
        extract: z.ZodOptional<z.ZodEffects<z.ZodString, string, string>>;
        /**
         * What to do when `extract` matches nothing in the file at runtime —
         * or, with `decode`, when no candidate survives verification.
         *
         * - `"warn"` (default): emit a stderr warning and leave the file
         *   readable as-is inside the sandbox (fail-open). A non-matching
         *   pattern is treated as a config error to surface and fix, not a
         *   reason to break a tool that needs the file when the credential is
         *   legitimately absent.
         * - `"deny"`: degrade the entry to `mode: "deny"` so the file is
         *   unreadable inside the sandbox (fail-closed). The operator declared
         *   this file as containing a credential; if the regex cannot find it,
         *   block access rather than expose it.
         * - `"error"`: throw at wrap time so nothing runs until the operator
         *   fixes the config.
         *
         * Only meaningful when `mode` is `"mask"` and `extract` or `decode` is
         * set; accepted but ignored otherwise.
         */
        onExtractNoMatch: z.ZodOptional<z.ZodEnum<["warn", "deny", "error"]>>;
        decode: z.ZodOptional<z.ZodEnum<["jwt"]>>;
        /**
         * Names of top-level payload claims to mask inside each decoded value —
         * the claim-level counterpart of `extract`: where `extract` opens plain
         * text to mask a span inside it, `decode` + `maskClaims` opens the
         * encoding to mask a field inside the decoded payload.
         *
         * For each verified JWT candidate, every named claim present with a
         * string value is replaced by its own sentinel and the token is rebuilt
         * around the modified payload (original header, filler signature). All
         * other claims are preserved verbatim, so a tool that decodes the token
         * and reads a non-secret claim (issuer, audience, user id) keeps
         * working while the secret claim is protected. A named claim that is
         * absent or non-string in a given token is skipped. If no named claim
         * matches in any verified token, behaviour is governed by
         * `onExtractNoMatch` — same as no candidate verifying.
         *
         * Requires `decode` (there is no payload to look inside otherwise); an
         * explicitly empty list is rejected — see the superRefine below.
         */
        maskClaims: z.ZodOptional<z.ZodArray<z.ZodString, "many">>;
        maskDuplicates: z.ZodOptional<z.ZodBoolean>;
        injectHosts: z.ZodOptional<z.ZodArray<z.ZodEffects<z.ZodString, string, string>, "many">>;
    }, "strip", z.ZodTypeAny, {
        mode: "deny" | "mask";
        path: string;
        extract?: string | undefined;
        onExtractNoMatch?: "error" | "warn" | "deny" | undefined;
        decode?: "jwt" | undefined;
        maskClaims?: string[] | undefined;
        maskDuplicates?: boolean | undefined;
        injectHosts?: string[] | undefined;
    }, {
        mode: "deny" | "mask";
        path: string;
        extract?: string | undefined;
        onExtractNoMatch?: "error" | "warn" | "deny" | undefined;
        decode?: "jwt" | undefined;
        maskClaims?: string[] | undefined;
        maskDuplicates?: boolean | undefined;
        injectHosts?: string[] | undefined;
    }>, "many">>;
    envVars: z.ZodOptional<z.ZodArray<z.ZodObject<{
        name: z.ZodString;
        mode: z.ZodEnum<["deny", "mask"]>;
        extract: z.ZodOptional<z.ZodEffects<z.ZodString, string, string>>;
        /**
         * What to do when `extract` matches nothing in the value at runtime.
         *
         * - `"warn"` (default): emit a stderr warning and let the variable pass
         *   through unmasked inside the sandbox (fail-open). A non-matching
         *   pattern is treated as a config error to surface and fix, not a
         *   reason to break a tool that needs the variable when the credential
         *   is legitimately absent from it.
         * - `"deny"`: unset the variable inside the sandbox (fail-closed) — the
         *   env analog of degrading a file to `mode: "deny"`. The operator
         *   declared this variable as containing a credential; if the regex
         *   cannot find it, withhold the value rather than expose it.
         * - `"error"`: throw at wrap time so nothing runs until the operator
         *   fixes the regex.
         *
         * Only meaningful when `mode` is `"mask"` and `extract` is set;
         * accepted but ignored otherwise.
         */
        onExtractNoMatch: z.ZodOptional<z.ZodEnum<["warn", "deny", "error"]>>;
        decode: z.ZodOptional<z.ZodEnum<["jwt"]>>;
        /**
         * Names of top-level payload claims to mask inside the decoded value —
         * the env-var counterpart of the `maskClaims` on a file entry: `decode`
         * opens the variable's encoded value so masking can target a field
         * inside the decoded payload instead of replacing the whole token.
         *
         * Every named claim present with a string value is replaced by its own
         * sentinel and the token is rebuilt around the modified payload
         * (original header segment, filler signature). All other claims are
         * preserved verbatim, so a tool that decodes the token and reads a
         * non-secret claim (issuer, audience, user id) keeps working while the
         * secret claim is protected. A named claim that is absent or non-string
         * is skipped. If no named claim matches, nothing was masked and the
         * entry fails open with a stderr warning — same path as a value that
         * does not verify as a JWT.
         *
         * Requires `decode` (there is no payload to look inside otherwise); an
         * explicitly empty list is rejected — see the superRefine below.
         */
        maskClaims: z.ZodOptional<z.ZodArray<z.ZodString, "many">>;
        injectHosts: z.ZodOptional<z.ZodArray<z.ZodEffects<z.ZodString, string, string>, "many">>;
    }, "strip", z.ZodTypeAny, {
        mode: "deny" | "mask";
        name: string;
        extract?: string | undefined;
        onExtractNoMatch?: "error" | "warn" | "deny" | undefined;
        decode?: "jwt" | undefined;
        maskClaims?: string[] | undefined;
        injectHosts?: string[] | undefined;
    }, {
        mode: "deny" | "mask";
        name: string;
        extract?: string | undefined;
        onExtractNoMatch?: "error" | "warn" | "deny" | undefined;
        decode?: "jwt" | undefined;
        maskClaims?: string[] | undefined;
        injectHosts?: string[] | undefined;
    }>, "many">>;
    allowPlaintextInject: z.ZodOptional<z.ZodBoolean>;
    awsPairs: z.ZodOptional<z.ZodArray<z.ZodObject<{
        accessKeyIdVar: z.ZodString;
        secretAccessKeyVar: z.ZodString;
        sessionTokenVar: z.ZodOptional<z.ZodString>;
    }, "strict", z.ZodTypeAny, {
        accessKeyIdVar: string;
        secretAccessKeyVar: string;
        sessionTokenVar?: string | undefined;
    }, {
        accessKeyIdVar: string;
        secretAccessKeyVar: string;
        sessionTokenVar?: string | undefined;
    }>, "many">>;
    sigv4: z.ZodOptional<z.ZodObject<{
        streaming: z.ZodOptional<z.ZodEnum<["deny", "passthrough"]>>;
        presigned: z.ZodOptional<z.ZodEnum<["deny", "passthrough"]>>;
        sigv4a: z.ZodOptional<z.ZodEnum<["deny", "passthrough"]>>;
    }, "strict", z.ZodTypeAny, {
        streaming?: "deny" | "passthrough" | undefined;
        presigned?: "deny" | "passthrough" | undefined;
        sigv4a?: "deny" | "passthrough" | undefined;
    }, {
        streaming?: "deny" | "passthrough" | undefined;
        presigned?: "deny" | "passthrough" | undefined;
        sigv4a?: "deny" | "passthrough" | undefined;
    }>>;
}, "strict", z.ZodTypeAny, {
    files?: {
        mode: "deny" | "mask";
        path: string;
        extract?: string | undefined;
        onExtractNoMatch?: "error" | "warn" | "deny" | undefined;
        decode?: "jwt" | undefined;
        maskClaims?: string[] | undefined;
        maskDuplicates?: boolean | undefined;
        injectHosts?: string[] | undefined;
    }[] | undefined;
    envVars?: {
        mode: "deny" | "mask";
        name: string;
        extract?: string | undefined;
        onExtractNoMatch?: "error" | "warn" | "deny" | undefined;
        decode?: "jwt" | undefined;
        maskClaims?: string[] | undefined;
        injectHosts?: string[] | undefined;
    }[] | undefined;
    allowPlaintextInject?: boolean | undefined;
    awsPairs?: {
        accessKeyIdVar: string;
        secretAccessKeyVar: string;
        sessionTokenVar?: string | undefined;
    }[] | undefined;
    sigv4?: {
        streaming?: "deny" | "passthrough" | undefined;
        presigned?: "deny" | "passthrough" | undefined;
        sigv4a?: "deny" | "passthrough" | undefined;
    } | undefined;
}, {
    files?: {
        mode: "deny" | "mask";
        path: string;
        extract?: string | undefined;
        onExtractNoMatch?: "error" | "warn" | "deny" | undefined;
        decode?: "jwt" | undefined;
        maskClaims?: string[] | undefined;
        maskDuplicates?: boolean | undefined;
        injectHosts?: string[] | undefined;
    }[] | undefined;
    envVars?: {
        mode: "deny" | "mask";
        name: string;
        extract?: string | undefined;
        onExtractNoMatch?: "error" | "warn" | "deny" | undefined;
        decode?: "jwt" | undefined;
        maskClaims?: string[] | undefined;
        injectHosts?: string[] | undefined;
    }[] | undefined;
    allowPlaintextInject?: boolean | undefined;
    awsPairs?: {
        accessKeyIdVar: string;
        secretAccessKeyVar: string;
        sessionTokenVar?: string | undefined;
    }[] | undefined;
    sigv4?: {
        streaming?: "deny" | "passthrough" | undefined;
        presigned?: "deny" | "passthrough" | undefined;
        sigv4a?: "deny" | "passthrough" | undefined;
    } | undefined;
}>;
/**
 * Network configuration schema for validation
 */
export declare const NetworkConfigSchema: z.ZodObject<{
    allowedDomains: z.ZodArray<z.ZodEffects<z.ZodString, string, string>, "many">;
    deniedDomains: z.ZodArray<z.ZodEffects<z.ZodString, string, string>, "many">;
    deniedDomainReasons: z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodString>>;
    strictAllowlist: z.ZodOptional<z.ZodBoolean>;
    allowUnixSockets: z.ZodOptional<z.ZodArray<z.ZodString, "many">>;
    allowAllUnixSockets: z.ZodOptional<z.ZodBoolean>;
    allowLocalBinding: z.ZodOptional<z.ZodBoolean>;
    allowMachLookup: z.ZodOptional<z.ZodArray<z.ZodEffects<z.ZodString, string, string>, "many">>;
    httpProxyPort: z.ZodOptional<z.ZodNumber>;
    socksProxyPort: z.ZodOptional<z.ZodNumber>;
    mitmProxy: z.ZodOptional<z.ZodObject<{
        socketPath: z.ZodString;
        domains: z.ZodArray<z.ZodEffects<z.ZodString, string, string>, "many">;
    }, "strip", z.ZodTypeAny, {
        socketPath: string;
        domains: string[];
    }, {
        socketPath: string;
        domains: string[];
    }>>;
    filterRequest: z.ZodOptional<z.ZodType<FilterRequestCallback, z.ZodTypeDef, FilterRequestCallback>>;
    tlsTerminate: z.ZodOptional<z.ZodEffects<z.ZodObject<{
        caCertPath: z.ZodOptional<z.ZodString>;
        caKeyPath: z.ZodOptional<z.ZodString>;
        excludeDomains: z.ZodOptional<z.ZodArray<z.ZodEffects<z.ZodString, string, string>, "many">>;
        extraCaCertPaths: z.ZodOptional<z.ZodArray<z.ZodString, "many">>;
    }, "strip", z.ZodTypeAny, {
        caCertPath?: string | undefined;
        caKeyPath?: string | undefined;
        excludeDomains?: string[] | undefined;
        extraCaCertPaths?: string[] | undefined;
    }, {
        caCertPath?: string | undefined;
        caKeyPath?: string | undefined;
        excludeDomains?: string[] | undefined;
        extraCaCertPaths?: string[] | undefined;
    }>, {
        caCertPath?: string | undefined;
        caKeyPath?: string | undefined;
        excludeDomains?: string[] | undefined;
        extraCaCertPaths?: string[] | undefined;
    }, {
        caCertPath?: string | undefined;
        caKeyPath?: string | undefined;
        excludeDomains?: string[] | undefined;
        extraCaCertPaths?: string[] | undefined;
    }>>;
    parentProxy: z.ZodOptional<z.ZodObject<{
        http: z.ZodOptional<z.ZodString>;
        https: z.ZodOptional<z.ZodString>;
        noProxy: z.ZodOptional<z.ZodString>;
    }, "strip", z.ZodTypeAny, {
        http?: string | undefined;
        https?: string | undefined;
        noProxy?: string | undefined;
    }, {
        http?: string | undefined;
        https?: string | undefined;
        noProxy?: string | undefined;
    }>>;
}, "strip", z.ZodTypeAny, {
    allowedDomains: string[];
    deniedDomains: string[];
    deniedDomainReasons?: Record<string, string> | undefined;
    strictAllowlist?: boolean | undefined;
    allowUnixSockets?: string[] | undefined;
    allowAllUnixSockets?: boolean | undefined;
    allowLocalBinding?: boolean | undefined;
    allowMachLookup?: string[] | undefined;
    httpProxyPort?: number | undefined;
    socksProxyPort?: number | undefined;
    mitmProxy?: {
        socketPath: string;
        domains: string[];
    } | undefined;
    filterRequest?: FilterRequestCallback | undefined;
    tlsTerminate?: {
        caCertPath?: string | undefined;
        caKeyPath?: string | undefined;
        excludeDomains?: string[] | undefined;
        extraCaCertPaths?: string[] | undefined;
    } | undefined;
    parentProxy?: {
        http?: string | undefined;
        https?: string | undefined;
        noProxy?: string | undefined;
    } | undefined;
}, {
    allowedDomains: string[];
    deniedDomains: string[];
    deniedDomainReasons?: Record<string, string> | undefined;
    strictAllowlist?: boolean | undefined;
    allowUnixSockets?: string[] | undefined;
    allowAllUnixSockets?: boolean | undefined;
    allowLocalBinding?: boolean | undefined;
    allowMachLookup?: string[] | undefined;
    httpProxyPort?: number | undefined;
    socksProxyPort?: number | undefined;
    mitmProxy?: {
        socketPath: string;
        domains: string[];
    } | undefined;
    filterRequest?: FilterRequestCallback | undefined;
    tlsTerminate?: {
        caCertPath?: string | undefined;
        caKeyPath?: string | undefined;
        excludeDomains?: string[] | undefined;
        extraCaCertPaths?: string[] | undefined;
    } | undefined;
    parentProxy?: {
        http?: string | undefined;
        https?: string | undefined;
        noProxy?: string | undefined;
    } | undefined;
}>;
/**
 * Filesystem configuration schema for validation
 */
export declare const FilesystemConfigSchema: z.ZodObject<{
    disabled: z.ZodOptional<z.ZodBoolean>;
    denyRead: z.ZodArray<z.ZodString, "many">;
    allowRead: z.ZodOptional<z.ZodArray<z.ZodString, "many">>;
    allowWrite: z.ZodArray<z.ZodString, "many">;
    denyWrite: z.ZodArray<z.ZodString, "many">;
    allowGitConfig: z.ZodOptional<z.ZodBoolean>;
}, "strip", z.ZodTypeAny, {
    denyRead: string[];
    allowWrite: string[];
    denyWrite: string[];
    disabled?: boolean | undefined;
    allowRead?: string[] | undefined;
    allowGitConfig?: boolean | undefined;
}, {
    denyRead: string[];
    allowWrite: string[];
    denyWrite: string[];
    disabled?: boolean | undefined;
    allowRead?: string[] | undefined;
    allowGitConfig?: boolean | undefined;
}>;
/**
 * Configuration schema for ignoring specific sandbox violations
 * Maps command patterns to filesystem paths to ignore violations for.
 */
export declare const IgnoreViolationsConfigSchema: z.ZodRecord<z.ZodString, z.ZodArray<z.ZodString, "many">>;
/**
 * Ripgrep configuration schema
 */
export declare const RipgrepConfigSchema: z.ZodObject<{
    command: z.ZodString;
    args: z.ZodOptional<z.ZodArray<z.ZodString, "many">>;
    argv0: z.ZodOptional<z.ZodString>;
}, "strip", z.ZodTypeAny, {
    command: string;
    args?: string[] | undefined;
    argv0?: string | undefined;
}, {
    command: string;
    args?: string[] | undefined;
    argv0?: string | undefined;
}>;
/**
 * Git configuration schema (cross-platform). Injected via
 * `GIT_CONFIG_COUNT` / `GIT_CONFIG_KEY_<n>` / `GIT_CONFIG_VALUE_<n>`
 * env vars — see `buildGitConfigEnv` in `sandbox-utils.ts`.
 */
export declare const GitConfigSchema: z.ZodObject<{
    safeDirectories: z.ZodDefault<z.ZodArray<z.ZodString, "many">>;
}, "strip", z.ZodTypeAny, {
    safeDirectories: string[];
}, {
    safeDirectories?: string[] | undefined;
}>;
/**
 * Configuration for locating/invoking the `srt-win` helper (Windows
 * only). An embedder that links `srt-win`'s CLI into its own
 * multicall binary points `path` at that binary; spawns then pass
 * `--srt-win` as `argv[1]` (see `SRT_WIN_DISPATCH_ARG1` in
 * `windows-sandbox-utils.ts` / `srt_win::SRT_WIN_DISPATCH_ARG1`) so
 * the embedder's dispatcher can route to `srt_win::run_from_args`.
 * Windows cannot reliably preserve a spoofed `argv[0]` across
 * `CreateProcessWithLogonW` / `ShellExecuteExW(runas)`, so dispatch
 * keys on `argv[1]`, not on `argv[0]` like
 * {@link SeccompConfigSchema} does on Linux.
 */
export declare const SrtWinConfigSchema: z.ZodObject<{
    path: z.ZodString;
}, "strip", z.ZodTypeAny, {
    path: string;
}, {
    path: string;
}>;
/**
 * Windows-specific configuration schema. See
 * `windows-sandbox-utils.ts` for the install flow these settings
 * must agree with.
 *
 * Canonical: `sublayerGuid`; the `wfpSublayerGuid` alias is resolved
 * at read sites (`sublayerGuid ?? wfpSublayerGuid`) rather than via
 * `.transform()` so this stays a plain `ZodObject` for consumers that
 * `.extend()`/`.shape` it.
 */
export declare const WindowsConfigSchema: z.ZodObject<{
    sandboxUser: z.ZodOptional<z.ZodString>;
    sublayerGuid: z.ZodOptional<z.ZodString>;
    wfpSublayerGuid: z.ZodOptional<z.ZodString>;
    proxyPortRange: z.ZodOptional<z.ZodEffects<z.ZodTuple<[z.ZodNumber, z.ZodNumber], null>, [number, number], [number, number]>>;
    srtWin: z.ZodOptional<z.ZodObject<{
        path: z.ZodString;
    }, "strip", z.ZodTypeAny, {
        path: string;
    }, {
        path: string;
    }>>;
}, "strip", z.ZodTypeAny, {
    sandboxUser?: string | undefined;
    sublayerGuid?: string | undefined;
    wfpSublayerGuid?: string | undefined;
    proxyPortRange?: [number, number] | undefined;
    srtWin?: {
        path: string;
    } | undefined;
}, {
    sandboxUser?: string | undefined;
    sublayerGuid?: string | undefined;
    wfpSublayerGuid?: string | undefined;
    proxyPortRange?: [number, number] | undefined;
    srtWin?: {
        path: string;
    } | undefined;
}>;
/**
 * Seccomp configuration schema (Linux only)
 */
export declare const SeccompConfigSchema: z.ZodObject<{
    applyPath: z.ZodOptional<z.ZodString>;
    argv0: z.ZodOptional<z.ZodString>;
}, "strip", z.ZodTypeAny, {
    argv0?: string | undefined;
    applyPath?: string | undefined;
}, {
    argv0?: string | undefined;
    applyPath?: string | undefined;
}>;
/**
 * Main configuration schema for Sandbox Runtime validation
 */
export declare const SandboxRuntimeConfigSchema: z.ZodEffects<z.ZodObject<{
    network: z.ZodObject<{
        allowedDomains: z.ZodArray<z.ZodEffects<z.ZodString, string, string>, "many">;
        deniedDomains: z.ZodArray<z.ZodEffects<z.ZodString, string, string>, "many">;
        deniedDomainReasons: z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodString>>;
        strictAllowlist: z.ZodOptional<z.ZodBoolean>;
        allowUnixSockets: z.ZodOptional<z.ZodArray<z.ZodString, "many">>;
        allowAllUnixSockets: z.ZodOptional<z.ZodBoolean>;
        allowLocalBinding: z.ZodOptional<z.ZodBoolean>;
        allowMachLookup: z.ZodOptional<z.ZodArray<z.ZodEffects<z.ZodString, string, string>, "many">>;
        httpProxyPort: z.ZodOptional<z.ZodNumber>;
        socksProxyPort: z.ZodOptional<z.ZodNumber>;
        mitmProxy: z.ZodOptional<z.ZodObject<{
            socketPath: z.ZodString;
            domains: z.ZodArray<z.ZodEffects<z.ZodString, string, string>, "many">;
        }, "strip", z.ZodTypeAny, {
            socketPath: string;
            domains: string[];
        }, {
            socketPath: string;
            domains: string[];
        }>>;
        filterRequest: z.ZodOptional<z.ZodType<FilterRequestCallback, z.ZodTypeDef, FilterRequestCallback>>;
        tlsTerminate: z.ZodOptional<z.ZodEffects<z.ZodObject<{
            caCertPath: z.ZodOptional<z.ZodString>;
            caKeyPath: z.ZodOptional<z.ZodString>;
            excludeDomains: z.ZodOptional<z.ZodArray<z.ZodEffects<z.ZodString, string, string>, "many">>;
            extraCaCertPaths: z.ZodOptional<z.ZodArray<z.ZodString, "many">>;
        }, "strip", z.ZodTypeAny, {
            caCertPath?: string | undefined;
            caKeyPath?: string | undefined;
            excludeDomains?: string[] | undefined;
            extraCaCertPaths?: string[] | undefined;
        }, {
            caCertPath?: string | undefined;
            caKeyPath?: string | undefined;
            excludeDomains?: string[] | undefined;
            extraCaCertPaths?: string[] | undefined;
        }>, {
            caCertPath?: string | undefined;
            caKeyPath?: string | undefined;
            excludeDomains?: string[] | undefined;
            extraCaCertPaths?: string[] | undefined;
        }, {
            caCertPath?: string | undefined;
            caKeyPath?: string | undefined;
            excludeDomains?: string[] | undefined;
            extraCaCertPaths?: string[] | undefined;
        }>>;
        parentProxy: z.ZodOptional<z.ZodObject<{
            http: z.ZodOptional<z.ZodString>;
            https: z.ZodOptional<z.ZodString>;
            noProxy: z.ZodOptional<z.ZodString>;
        }, "strip", z.ZodTypeAny, {
            http?: string | undefined;
            https?: string | undefined;
            noProxy?: string | undefined;
        }, {
            http?: string | undefined;
            https?: string | undefined;
            noProxy?: string | undefined;
        }>>;
    }, "strip", z.ZodTypeAny, {
        allowedDomains: string[];
        deniedDomains: string[];
        deniedDomainReasons?: Record<string, string> | undefined;
        strictAllowlist?: boolean | undefined;
        allowUnixSockets?: string[] | undefined;
        allowAllUnixSockets?: boolean | undefined;
        allowLocalBinding?: boolean | undefined;
        allowMachLookup?: string[] | undefined;
        httpProxyPort?: number | undefined;
        socksProxyPort?: number | undefined;
        mitmProxy?: {
            socketPath: string;
            domains: string[];
        } | undefined;
        filterRequest?: FilterRequestCallback | undefined;
        tlsTerminate?: {
            caCertPath?: string | undefined;
            caKeyPath?: string | undefined;
            excludeDomains?: string[] | undefined;
            extraCaCertPaths?: string[] | undefined;
        } | undefined;
        parentProxy?: {
            http?: string | undefined;
            https?: string | undefined;
            noProxy?: string | undefined;
        } | undefined;
    }, {
        allowedDomains: string[];
        deniedDomains: string[];
        deniedDomainReasons?: Record<string, string> | undefined;
        strictAllowlist?: boolean | undefined;
        allowUnixSockets?: string[] | undefined;
        allowAllUnixSockets?: boolean | undefined;
        allowLocalBinding?: boolean | undefined;
        allowMachLookup?: string[] | undefined;
        httpProxyPort?: number | undefined;
        socksProxyPort?: number | undefined;
        mitmProxy?: {
            socketPath: string;
            domains: string[];
        } | undefined;
        filterRequest?: FilterRequestCallback | undefined;
        tlsTerminate?: {
            caCertPath?: string | undefined;
            caKeyPath?: string | undefined;
            excludeDomains?: string[] | undefined;
            extraCaCertPaths?: string[] | undefined;
        } | undefined;
        parentProxy?: {
            http?: string | undefined;
            https?: string | undefined;
            noProxy?: string | undefined;
        } | undefined;
    }>;
    filesystem: z.ZodObject<{
        disabled: z.ZodOptional<z.ZodBoolean>;
        denyRead: z.ZodArray<z.ZodString, "many">;
        allowRead: z.ZodOptional<z.ZodArray<z.ZodString, "many">>;
        allowWrite: z.ZodArray<z.ZodString, "many">;
        denyWrite: z.ZodArray<z.ZodString, "many">;
        allowGitConfig: z.ZodOptional<z.ZodBoolean>;
    }, "strip", z.ZodTypeAny, {
        denyRead: string[];
        allowWrite: string[];
        denyWrite: string[];
        disabled?: boolean | undefined;
        allowRead?: string[] | undefined;
        allowGitConfig?: boolean | undefined;
    }, {
        denyRead: string[];
        allowWrite: string[];
        denyWrite: string[];
        disabled?: boolean | undefined;
        allowRead?: string[] | undefined;
        allowGitConfig?: boolean | undefined;
    }>;
    credentials: z.ZodOptional<z.ZodObject<{
        files: z.ZodOptional<z.ZodArray<z.ZodObject<{
            path: z.ZodString;
            mode: z.ZodEnum<["deny", "mask"]>;
            extract: z.ZodOptional<z.ZodEffects<z.ZodString, string, string>>;
            /**
             * What to do when `extract` matches nothing in the file at runtime —
             * or, with `decode`, when no candidate survives verification.
             *
             * - `"warn"` (default): emit a stderr warning and leave the file
             *   readable as-is inside the sandbox (fail-open). A non-matching
             *   pattern is treated as a config error to surface and fix, not a
             *   reason to break a tool that needs the file when the credential is
             *   legitimately absent.
             * - `"deny"`: degrade the entry to `mode: "deny"` so the file is
             *   unreadable inside the sandbox (fail-closed). The operator declared
             *   this file as containing a credential; if the regex cannot find it,
             *   block access rather than expose it.
             * - `"error"`: throw at wrap time so nothing runs until the operator
             *   fixes the config.
             *
             * Only meaningful when `mode` is `"mask"` and `extract` or `decode` is
             * set; accepted but ignored otherwise.
             */
            onExtractNoMatch: z.ZodOptional<z.ZodEnum<["warn", "deny", "error"]>>;
            decode: z.ZodOptional<z.ZodEnum<["jwt"]>>;
            /**
             * Names of top-level payload claims to mask inside each decoded value —
             * the claim-level counterpart of `extract`: where `extract` opens plain
             * text to mask a span inside it, `decode` + `maskClaims` opens the
             * encoding to mask a field inside the decoded payload.
             *
             * For each verified JWT candidate, every named claim present with a
             * string value is replaced by its own sentinel and the token is rebuilt
             * around the modified payload (original header, filler signature). All
             * other claims are preserved verbatim, so a tool that decodes the token
             * and reads a non-secret claim (issuer, audience, user id) keeps
             * working while the secret claim is protected. A named claim that is
             * absent or non-string in a given token is skipped. If no named claim
             * matches in any verified token, behaviour is governed by
             * `onExtractNoMatch` — same as no candidate verifying.
             *
             * Requires `decode` (there is no payload to look inside otherwise); an
             * explicitly empty list is rejected — see the superRefine below.
             */
            maskClaims: z.ZodOptional<z.ZodArray<z.ZodString, "many">>;
            maskDuplicates: z.ZodOptional<z.ZodBoolean>;
            injectHosts: z.ZodOptional<z.ZodArray<z.ZodEffects<z.ZodString, string, string>, "many">>;
        }, "strip", z.ZodTypeAny, {
            mode: "deny" | "mask";
            path: string;
            extract?: string | undefined;
            onExtractNoMatch?: "error" | "warn" | "deny" | undefined;
            decode?: "jwt" | undefined;
            maskClaims?: string[] | undefined;
            maskDuplicates?: boolean | undefined;
            injectHosts?: string[] | undefined;
        }, {
            mode: "deny" | "mask";
            path: string;
            extract?: string | undefined;
            onExtractNoMatch?: "error" | "warn" | "deny" | undefined;
            decode?: "jwt" | undefined;
            maskClaims?: string[] | undefined;
            maskDuplicates?: boolean | undefined;
            injectHosts?: string[] | undefined;
        }>, "many">>;
        envVars: z.ZodOptional<z.ZodArray<z.ZodObject<{
            name: z.ZodString;
            mode: z.ZodEnum<["deny", "mask"]>;
            extract: z.ZodOptional<z.ZodEffects<z.ZodString, string, string>>;
            /**
             * What to do when `extract` matches nothing in the value at runtime.
             *
             * - `"warn"` (default): emit a stderr warning and let the variable pass
             *   through unmasked inside the sandbox (fail-open). A non-matching
             *   pattern is treated as a config error to surface and fix, not a
             *   reason to break a tool that needs the variable when the credential
             *   is legitimately absent from it.
             * - `"deny"`: unset the variable inside the sandbox (fail-closed) — the
             *   env analog of degrading a file to `mode: "deny"`. The operator
             *   declared this variable as containing a credential; if the regex
             *   cannot find it, withhold the value rather than expose it.
             * - `"error"`: throw at wrap time so nothing runs until the operator
             *   fixes the regex.
             *
             * Only meaningful when `mode` is `"mask"` and `extract` is set;
             * accepted but ignored otherwise.
             */
            onExtractNoMatch: z.ZodOptional<z.ZodEnum<["warn", "deny", "error"]>>;
            decode: z.ZodOptional<z.ZodEnum<["jwt"]>>;
            /**
             * Names of top-level payload claims to mask inside the decoded value —
             * the env-var counterpart of the `maskClaims` on a file entry: `decode`
             * opens the variable's encoded value so masking can target a field
             * inside the decoded payload instead of replacing the whole token.
             *
             * Every named claim present with a string value is replaced by its own
             * sentinel and the token is rebuilt around the modified payload
             * (original header segment, filler signature). All other claims are
             * preserved verbatim, so a tool that decodes the token and reads a
             * non-secret claim (issuer, audience, user id) keeps working while the
             * secret claim is protected. A named claim that is absent or non-string
             * is skipped. If no named claim matches, nothing was masked and the
             * entry fails open with a stderr warning — same path as a value that
             * does not verify as a JWT.
             *
             * Requires `decode` (there is no payload to look inside otherwise); an
             * explicitly empty list is rejected — see the superRefine below.
             */
            maskClaims: z.ZodOptional<z.ZodArray<z.ZodString, "many">>;
            injectHosts: z.ZodOptional<z.ZodArray<z.ZodEffects<z.ZodString, string, string>, "many">>;
        }, "strip", z.ZodTypeAny, {
            mode: "deny" | "mask";
            name: string;
            extract?: string | undefined;
            onExtractNoMatch?: "error" | "warn" | "deny" | undefined;
            decode?: "jwt" | undefined;
            maskClaims?: string[] | undefined;
            injectHosts?: string[] | undefined;
        }, {
            mode: "deny" | "mask";
            name: string;
            extract?: string | undefined;
            onExtractNoMatch?: "error" | "warn" | "deny" | undefined;
            decode?: "jwt" | undefined;
            maskClaims?: string[] | undefined;
            injectHosts?: string[] | undefined;
        }>, "many">>;
        allowPlaintextInject: z.ZodOptional<z.ZodBoolean>;
        awsPairs: z.ZodOptional<z.ZodArray<z.ZodObject<{
            accessKeyIdVar: z.ZodString;
            secretAccessKeyVar: z.ZodString;
            sessionTokenVar: z.ZodOptional<z.ZodString>;
        }, "strict", z.ZodTypeAny, {
            accessKeyIdVar: string;
            secretAccessKeyVar: string;
            sessionTokenVar?: string | undefined;
        }, {
            accessKeyIdVar: string;
            secretAccessKeyVar: string;
            sessionTokenVar?: string | undefined;
        }>, "many">>;
        sigv4: z.ZodOptional<z.ZodObject<{
            streaming: z.ZodOptional<z.ZodEnum<["deny", "passthrough"]>>;
            presigned: z.ZodOptional<z.ZodEnum<["deny", "passthrough"]>>;
            sigv4a: z.ZodOptional<z.ZodEnum<["deny", "passthrough"]>>;
        }, "strict", z.ZodTypeAny, {
            streaming?: "deny" | "passthrough" | undefined;
            presigned?: "deny" | "passthrough" | undefined;
            sigv4a?: "deny" | "passthrough" | undefined;
        }, {
            streaming?: "deny" | "passthrough" | undefined;
            presigned?: "deny" | "passthrough" | undefined;
            sigv4a?: "deny" | "passthrough" | undefined;
        }>>;
    }, "strict", z.ZodTypeAny, {
        files?: {
            mode: "deny" | "mask";
            path: string;
            extract?: string | undefined;
            onExtractNoMatch?: "error" | "warn" | "deny" | undefined;
            decode?: "jwt" | undefined;
            maskClaims?: string[] | undefined;
            maskDuplicates?: boolean | undefined;
            injectHosts?: string[] | undefined;
        }[] | undefined;
        envVars?: {
            mode: "deny" | "mask";
            name: string;
            extract?: string | undefined;
            onExtractNoMatch?: "error" | "warn" | "deny" | undefined;
            decode?: "jwt" | undefined;
            maskClaims?: string[] | undefined;
            injectHosts?: string[] | undefined;
        }[] | undefined;
        allowPlaintextInject?: boolean | undefined;
        awsPairs?: {
            accessKeyIdVar: string;
            secretAccessKeyVar: string;
            sessionTokenVar?: string | undefined;
        }[] | undefined;
        sigv4?: {
            streaming?: "deny" | "passthrough" | undefined;
            presigned?: "deny" | "passthrough" | undefined;
            sigv4a?: "deny" | "passthrough" | undefined;
        } | undefined;
    }, {
        files?: {
            mode: "deny" | "mask";
            path: string;
            extract?: string | undefined;
            onExtractNoMatch?: "error" | "warn" | "deny" | undefined;
            decode?: "jwt" | undefined;
            maskClaims?: string[] | undefined;
            maskDuplicates?: boolean | undefined;
            injectHosts?: string[] | undefined;
        }[] | undefined;
        envVars?: {
            mode: "deny" | "mask";
            name: string;
            extract?: string | undefined;
            onExtractNoMatch?: "error" | "warn" | "deny" | undefined;
            decode?: "jwt" | undefined;
            maskClaims?: string[] | undefined;
            injectHosts?: string[] | undefined;
        }[] | undefined;
        allowPlaintextInject?: boolean | undefined;
        awsPairs?: {
            accessKeyIdVar: string;
            secretAccessKeyVar: string;
            sessionTokenVar?: string | undefined;
        }[] | undefined;
        sigv4?: {
            streaming?: "deny" | "passthrough" | undefined;
            presigned?: "deny" | "passthrough" | undefined;
            sigv4a?: "deny" | "passthrough" | undefined;
        } | undefined;
    }>>;
    ignoreViolations: z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodArray<z.ZodString, "many">>>;
    enableWeakerNestedSandbox: z.ZodOptional<z.ZodBoolean>;
    enableWeakerNetworkIsolation: z.ZodOptional<z.ZodBoolean>;
    allowAppleEvents: z.ZodOptional<z.ZodBoolean>;
    ripgrep: z.ZodOptional<z.ZodObject<{
        command: z.ZodString;
        args: z.ZodOptional<z.ZodArray<z.ZodString, "many">>;
        argv0: z.ZodOptional<z.ZodString>;
    }, "strip", z.ZodTypeAny, {
        command: string;
        args?: string[] | undefined;
        argv0?: string | undefined;
    }, {
        command: string;
        args?: string[] | undefined;
        argv0?: string | undefined;
    }>>;
    mandatoryDenySearchDepth: z.ZodOptional<z.ZodNumber>;
    allowPty: z.ZodOptional<z.ZodBoolean>;
    seccomp: z.ZodOptional<z.ZodObject<{
        applyPath: z.ZodOptional<z.ZodString>;
        argv0: z.ZodOptional<z.ZodString>;
    }, "strip", z.ZodTypeAny, {
        argv0?: string | undefined;
        applyPath?: string | undefined;
    }, {
        argv0?: string | undefined;
        applyPath?: string | undefined;
    }>>;
    bwrapPath: z.ZodOptional<z.ZodEffects<z.ZodString, string, string>>;
    socatPath: z.ZodOptional<z.ZodEffects<z.ZodString, string, string>>;
    windows: z.ZodOptional<z.ZodObject<{
        sandboxUser: z.ZodOptional<z.ZodString>;
        sublayerGuid: z.ZodOptional<z.ZodString>;
        wfpSublayerGuid: z.ZodOptional<z.ZodString>;
        proxyPortRange: z.ZodOptional<z.ZodEffects<z.ZodTuple<[z.ZodNumber, z.ZodNumber], null>, [number, number], [number, number]>>;
        srtWin: z.ZodOptional<z.ZodObject<{
            path: z.ZodString;
        }, "strip", z.ZodTypeAny, {
            path: string;
        }, {
            path: string;
        }>>;
    }, "strip", z.ZodTypeAny, {
        sandboxUser?: string | undefined;
        sublayerGuid?: string | undefined;
        wfpSublayerGuid?: string | undefined;
        proxyPortRange?: [number, number] | undefined;
        srtWin?: {
            path: string;
        } | undefined;
    }, {
        sandboxUser?: string | undefined;
        sublayerGuid?: string | undefined;
        wfpSublayerGuid?: string | undefined;
        proxyPortRange?: [number, number] | undefined;
        srtWin?: {
            path: string;
        } | undefined;
    }>>;
    git: z.ZodOptional<z.ZodObject<{
        safeDirectories: z.ZodDefault<z.ZodArray<z.ZodString, "many">>;
    }, "strip", z.ZodTypeAny, {
        safeDirectories: string[];
    }, {
        safeDirectories?: string[] | undefined;
    }>>;
}, "strip", z.ZodTypeAny, {
    network: {
        allowedDomains: string[];
        deniedDomains: string[];
        deniedDomainReasons?: Record<string, string> | undefined;
        strictAllowlist?: boolean | undefined;
        allowUnixSockets?: string[] | undefined;
        allowAllUnixSockets?: boolean | undefined;
        allowLocalBinding?: boolean | undefined;
        allowMachLookup?: string[] | undefined;
        httpProxyPort?: number | undefined;
        socksProxyPort?: number | undefined;
        mitmProxy?: {
            socketPath: string;
            domains: string[];
        } | undefined;
        filterRequest?: FilterRequestCallback | undefined;
        tlsTerminate?: {
            caCertPath?: string | undefined;
            caKeyPath?: string | undefined;
            excludeDomains?: string[] | undefined;
            extraCaCertPaths?: string[] | undefined;
        } | undefined;
        parentProxy?: {
            http?: string | undefined;
            https?: string | undefined;
            noProxy?: string | undefined;
        } | undefined;
    };
    filesystem: {
        denyRead: string[];
        allowWrite: string[];
        denyWrite: string[];
        disabled?: boolean | undefined;
        allowRead?: string[] | undefined;
        allowGitConfig?: boolean | undefined;
    };
    windows?: {
        sandboxUser?: string | undefined;
        sublayerGuid?: string | undefined;
        wfpSublayerGuid?: string | undefined;
        proxyPortRange?: [number, number] | undefined;
        srtWin?: {
            path: string;
        } | undefined;
    } | undefined;
    credentials?: {
        files?: {
            mode: "deny" | "mask";
            path: string;
            extract?: string | undefined;
            onExtractNoMatch?: "error" | "warn" | "deny" | undefined;
            decode?: "jwt" | undefined;
            maskClaims?: string[] | undefined;
            maskDuplicates?: boolean | undefined;
            injectHosts?: string[] | undefined;
        }[] | undefined;
        envVars?: {
            mode: "deny" | "mask";
            name: string;
            extract?: string | undefined;
            onExtractNoMatch?: "error" | "warn" | "deny" | undefined;
            decode?: "jwt" | undefined;
            maskClaims?: string[] | undefined;
            injectHosts?: string[] | undefined;
        }[] | undefined;
        allowPlaintextInject?: boolean | undefined;
        awsPairs?: {
            accessKeyIdVar: string;
            secretAccessKeyVar: string;
            sessionTokenVar?: string | undefined;
        }[] | undefined;
        sigv4?: {
            streaming?: "deny" | "passthrough" | undefined;
            presigned?: "deny" | "passthrough" | undefined;
            sigv4a?: "deny" | "passthrough" | undefined;
        } | undefined;
    } | undefined;
    ignoreViolations?: Record<string, string[]> | undefined;
    enableWeakerNestedSandbox?: boolean | undefined;
    enableWeakerNetworkIsolation?: boolean | undefined;
    allowAppleEvents?: boolean | undefined;
    ripgrep?: {
        command: string;
        args?: string[] | undefined;
        argv0?: string | undefined;
    } | undefined;
    mandatoryDenySearchDepth?: number | undefined;
    allowPty?: boolean | undefined;
    seccomp?: {
        argv0?: string | undefined;
        applyPath?: string | undefined;
    } | undefined;
    bwrapPath?: string | undefined;
    socatPath?: string | undefined;
    git?: {
        safeDirectories: string[];
    } | undefined;
}, {
    network: {
        allowedDomains: string[];
        deniedDomains: string[];
        deniedDomainReasons?: Record<string, string> | undefined;
        strictAllowlist?: boolean | undefined;
        allowUnixSockets?: string[] | undefined;
        allowAllUnixSockets?: boolean | undefined;
        allowLocalBinding?: boolean | undefined;
        allowMachLookup?: string[] | undefined;
        httpProxyPort?: number | undefined;
        socksProxyPort?: number | undefined;
        mitmProxy?: {
            socketPath: string;
            domains: string[];
        } | undefined;
        filterRequest?: FilterRequestCallback | undefined;
        tlsTerminate?: {
            caCertPath?: string | undefined;
            caKeyPath?: string | undefined;
            excludeDomains?: string[] | undefined;
            extraCaCertPaths?: string[] | undefined;
        } | undefined;
        parentProxy?: {
            http?: string | undefined;
            https?: string | undefined;
            noProxy?: string | undefined;
        } | undefined;
    };
    filesystem: {
        denyRead: string[];
        allowWrite: string[];
        denyWrite: string[];
        disabled?: boolean | undefined;
        allowRead?: string[] | undefined;
        allowGitConfig?: boolean | undefined;
    };
    windows?: {
        sandboxUser?: string | undefined;
        sublayerGuid?: string | undefined;
        wfpSublayerGuid?: string | undefined;
        proxyPortRange?: [number, number] | undefined;
        srtWin?: {
            path: string;
        } | undefined;
    } | undefined;
    credentials?: {
        files?: {
            mode: "deny" | "mask";
            path: string;
            extract?: string | undefined;
            onExtractNoMatch?: "error" | "warn" | "deny" | undefined;
            decode?: "jwt" | undefined;
            maskClaims?: string[] | undefined;
            maskDuplicates?: boolean | undefined;
            injectHosts?: string[] | undefined;
        }[] | undefined;
        envVars?: {
            mode: "deny" | "mask";
            name: string;
            extract?: string | undefined;
            onExtractNoMatch?: "error" | "warn" | "deny" | undefined;
            decode?: "jwt" | undefined;
            maskClaims?: string[] | undefined;
            injectHosts?: string[] | undefined;
        }[] | undefined;
        allowPlaintextInject?: boolean | undefined;
        awsPairs?: {
            accessKeyIdVar: string;
            secretAccessKeyVar: string;
            sessionTokenVar?: string | undefined;
        }[] | undefined;
        sigv4?: {
            streaming?: "deny" | "passthrough" | undefined;
            presigned?: "deny" | "passthrough" | undefined;
            sigv4a?: "deny" | "passthrough" | undefined;
        } | undefined;
    } | undefined;
    ignoreViolations?: Record<string, string[]> | undefined;
    enableWeakerNestedSandbox?: boolean | undefined;
    enableWeakerNetworkIsolation?: boolean | undefined;
    allowAppleEvents?: boolean | undefined;
    ripgrep?: {
        command: string;
        args?: string[] | undefined;
        argv0?: string | undefined;
    } | undefined;
    mandatoryDenySearchDepth?: number | undefined;
    allowPty?: boolean | undefined;
    seccomp?: {
        argv0?: string | undefined;
        applyPath?: string | undefined;
    } | undefined;
    bwrapPath?: string | undefined;
    socatPath?: string | undefined;
    git?: {
        safeDirectories?: string[] | undefined;
    } | undefined;
}>, {
    network: {
        allowedDomains: string[];
        deniedDomains: string[];
        deniedDomainReasons?: Record<string, string> | undefined;
        strictAllowlist?: boolean | undefined;
        allowUnixSockets?: string[] | undefined;
        allowAllUnixSockets?: boolean | undefined;
        allowLocalBinding?: boolean | undefined;
        allowMachLookup?: string[] | undefined;
        httpProxyPort?: number | undefined;
        socksProxyPort?: number | undefined;
        mitmProxy?: {
            socketPath: string;
            domains: string[];
        } | undefined;
        filterRequest?: FilterRequestCallback | undefined;
        tlsTerminate?: {
            caCertPath?: string | undefined;
            caKeyPath?: string | undefined;
            excludeDomains?: string[] | undefined;
            extraCaCertPaths?: string[] | undefined;
        } | undefined;
        parentProxy?: {
            http?: string | undefined;
            https?: string | undefined;
            noProxy?: string | undefined;
        } | undefined;
    };
    filesystem: {
        denyRead: string[];
        allowWrite: string[];
        denyWrite: string[];
        disabled?: boolean | undefined;
        allowRead?: string[] | undefined;
        allowGitConfig?: boolean | undefined;
    };
    windows?: {
        sandboxUser?: string | undefined;
        sublayerGuid?: string | undefined;
        wfpSublayerGuid?: string | undefined;
        proxyPortRange?: [number, number] | undefined;
        srtWin?: {
            path: string;
        } | undefined;
    } | undefined;
    credentials?: {
        files?: {
            mode: "deny" | "mask";
            path: string;
            extract?: string | undefined;
            onExtractNoMatch?: "error" | "warn" | "deny" | undefined;
            decode?: "jwt" | undefined;
            maskClaims?: string[] | undefined;
            maskDuplicates?: boolean | undefined;
            injectHosts?: string[] | undefined;
        }[] | undefined;
        envVars?: {
            mode: "deny" | "mask";
            name: string;
            extract?: string | undefined;
            onExtractNoMatch?: "error" | "warn" | "deny" | undefined;
            decode?: "jwt" | undefined;
            maskClaims?: string[] | undefined;
            injectHosts?: string[] | undefined;
        }[] | undefined;
        allowPlaintextInject?: boolean | undefined;
        awsPairs?: {
            accessKeyIdVar: string;
            secretAccessKeyVar: string;
            sessionTokenVar?: string | undefined;
        }[] | undefined;
        sigv4?: {
            streaming?: "deny" | "passthrough" | undefined;
            presigned?: "deny" | "passthrough" | undefined;
            sigv4a?: "deny" | "passthrough" | undefined;
        } | undefined;
    } | undefined;
    ignoreViolations?: Record<string, string[]> | undefined;
    enableWeakerNestedSandbox?: boolean | undefined;
    enableWeakerNetworkIsolation?: boolean | undefined;
    allowAppleEvents?: boolean | undefined;
    ripgrep?: {
        command: string;
        args?: string[] | undefined;
        argv0?: string | undefined;
    } | undefined;
    mandatoryDenySearchDepth?: number | undefined;
    allowPty?: boolean | undefined;
    seccomp?: {
        argv0?: string | undefined;
        applyPath?: string | undefined;
    } | undefined;
    bwrapPath?: string | undefined;
    socatPath?: string | undefined;
    git?: {
        safeDirectories: string[];
    } | undefined;
}, {
    network: {
        allowedDomains: string[];
        deniedDomains: string[];
        deniedDomainReasons?: Record<string, string> | undefined;
        strictAllowlist?: boolean | undefined;
        allowUnixSockets?: string[] | undefined;
        allowAllUnixSockets?: boolean | undefined;
        allowLocalBinding?: boolean | undefined;
        allowMachLookup?: string[] | undefined;
        httpProxyPort?: number | undefined;
        socksProxyPort?: number | undefined;
        mitmProxy?: {
            socketPath: string;
            domains: string[];
        } | undefined;
        filterRequest?: FilterRequestCallback | undefined;
        tlsTerminate?: {
            caCertPath?: string | undefined;
            caKeyPath?: string | undefined;
            excludeDomains?: string[] | undefined;
            extraCaCertPaths?: string[] | undefined;
        } | undefined;
        parentProxy?: {
            http?: string | undefined;
            https?: string | undefined;
            noProxy?: string | undefined;
        } | undefined;
    };
    filesystem: {
        denyRead: string[];
        allowWrite: string[];
        denyWrite: string[];
        disabled?: boolean | undefined;
        allowRead?: string[] | undefined;
        allowGitConfig?: boolean | undefined;
    };
    windows?: {
        sandboxUser?: string | undefined;
        sublayerGuid?: string | undefined;
        wfpSublayerGuid?: string | undefined;
        proxyPortRange?: [number, number] | undefined;
        srtWin?: {
            path: string;
        } | undefined;
    } | undefined;
    credentials?: {
        files?: {
            mode: "deny" | "mask";
            path: string;
            extract?: string | undefined;
            onExtractNoMatch?: "error" | "warn" | "deny" | undefined;
            decode?: "jwt" | undefined;
            maskClaims?: string[] | undefined;
            maskDuplicates?: boolean | undefined;
            injectHosts?: string[] | undefined;
        }[] | undefined;
        envVars?: {
            mode: "deny" | "mask";
            name: string;
            extract?: string | undefined;
            onExtractNoMatch?: "error" | "warn" | "deny" | undefined;
            decode?: "jwt" | undefined;
            maskClaims?: string[] | undefined;
            injectHosts?: string[] | undefined;
        }[] | undefined;
        allowPlaintextInject?: boolean | undefined;
        awsPairs?: {
            accessKeyIdVar: string;
            secretAccessKeyVar: string;
            sessionTokenVar?: string | undefined;
        }[] | undefined;
        sigv4?: {
            streaming?: "deny" | "passthrough" | undefined;
            presigned?: "deny" | "passthrough" | undefined;
            sigv4a?: "deny" | "passthrough" | undefined;
        } | undefined;
    } | undefined;
    ignoreViolations?: Record<string, string[]> | undefined;
    enableWeakerNestedSandbox?: boolean | undefined;
    enableWeakerNetworkIsolation?: boolean | undefined;
    allowAppleEvents?: boolean | undefined;
    ripgrep?: {
        command: string;
        args?: string[] | undefined;
        argv0?: string | undefined;
    } | undefined;
    mandatoryDenySearchDepth?: number | undefined;
    allowPty?: boolean | undefined;
    seccomp?: {
        argv0?: string | undefined;
        applyPath?: string | undefined;
    } | undefined;
    bwrapPath?: string | undefined;
    socatPath?: string | undefined;
    git?: {
        safeDirectories?: string[] | undefined;
    } | undefined;
}>;
export type MitmProxyConfig = z.infer<typeof MitmProxyConfigSchema>;
export type ParentProxyConfig = z.infer<typeof ParentProxyConfigSchema>;
export type NetworkConfig = z.infer<typeof NetworkConfigSchema>;
export type FilesystemConfig = z.infer<typeof FilesystemConfigSchema>;
export type CredentialMode = z.infer<typeof credentialModeSchema>;
export type CredentialFileConfig = z.infer<typeof CredentialFileConfigSchema>;
export type CredentialEnvVarConfig = z.infer<typeof CredentialEnvVarConfigSchema>;
export type CredentialsConfig = z.infer<typeof CredentialsConfigSchema>;
export type AwsPairConfig = z.infer<typeof AwsPairConfigSchema>;
export type Sigv4Config = z.infer<typeof Sigv4ConfigSchema>;
export type IgnoreViolationsConfig = z.infer<typeof IgnoreViolationsConfigSchema>;
export type RipgrepConfig = z.infer<typeof RipgrepConfigSchema>;
export type GitConfig = z.infer<typeof GitConfigSchema>;
export type SeccompConfig = z.infer<typeof SeccompConfigSchema>;
export type SrtWinConfig = z.infer<typeof SrtWinConfigSchema>;
export type WindowsConfig = z.infer<typeof WindowsConfigSchema>;
export type SandboxRuntimeConfig = z.infer<typeof SandboxRuntimeConfigSchema>;
export {};
//# sourceMappingURL=sandbox-config.d.ts.map