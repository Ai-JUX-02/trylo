# Native build input closeout, 2026-10-17

Baseline: public main `8045443bc297d17cd207e1a8d57c8914cccbd590`.

## Problem and contract

The public checkout contained PTY source/provenance but omitted the exact PTY
executable required by the offline build. It also omitted both sandbox helpers
without a runnable pinned acquisition step. A source release can omit generated
applications and caches; required build inputs still need an explicit acquisition
or supported build path.

This change publishes only the existing first-party Windows x64 PTY executable,
matching its existing provenance. It adds an explicit preparation script for the
existing sandbox-runtime 0.0.73 dependency. Build-time checks and runtime policy
are unchanged. No agent execution, context, learning, provider or credential
configuration is modified.

## Input integrity and scope

- PTY Git source blob: 21748 bytes, SHA-256 matches existing source provenance.
- PTY Git executable: 475136 bytes, SHA-256
  `ae9f7f6606b34fff023edbb49b1cf187dbea50faa0b97c3208e99a1caf526ac4`.
- Official sandbox npm archive 0.0.73: fixed SHA-512 in the preparation script;
  archive SHA-256 observed as `15555a1e919f6f114ba6b6e4d93289df0d77f72ae92a1236778d4421b17a66ce`.
- Only its two named Windows sandbox helpers are extracted, each checked against
  existing SHA-256 and byte counts. No upstream install script or upstream CLI runs.
- Downloaded sandbox binaries, node_modules, dist, Cargo target, Node/browser
  bodies, installer/APK, credentials and local recordings are excluded from Git.
- The export allowlist explicitly retains PTY; source completeness now checks
  its presence and exact digest. No broad binary allowlist was introduced.

## Verification

From the public checkout, starting with both sandbox inputs missing:

1. `node scripts/setup-cli-native.mjs --check`: exit 1, names both missing inputs.
2. `node scripts/setup-cli-native.mjs --install`: exit 0, actual official download
   and both helper hashes verified. Repeat check exits 0.
3. CLI `npm ci --no-audit --no-fund`: exit 0, locked installation.
4. CLI `node scripts/quality/verify.mjs`: all 11 steps pass, 38 contract checks,
   3994 hermetic test names, 528.25 seconds reported by verify.
5. Four process-session PTY suites via `node --test --test-concurrency=1`:
   pty-loader, pty-protocol, pty-session.platform and pty-audit-regressions.platform;
   38 passed, 0 failed, 0 skipped. Includes real Windows ConPTY sessions.
6. Preparation fixture checks: six pass, covering missing inputs, corrupted archive
   rejection, valid offline archive, final hashes, idempotent install without
   download, and refusal to overwrite a drifted existing helper.
7. Source-completeness check: 166 inputs, 107 fork modules, 10 tool manifests.
   Independent subprocess fault injection for absent and corrupted PTY makes the
   actual gate fail. No live artifact was moved or rewritten for these probes.
8. Export from the actual staged Git tree: PTY present with correct bytes;
   preparation initially reports missing sandbox inputs, accepts the exact pinned
   archive and then passes. No untracked helper was copied into this export.

Raw receipts are retained in the maintainer's local native-build-fix-20261017
audit folder, outside the public source. The commands and fixed pins above allow
independent reproduction.

## Review and limits

Readability/maintainability review passed: one explicit preparation entry point,
no new package dependency, existing provenance remains authoritative, offline
build failure checks retained. The downloader uses a timeout and byte bound,
verifies before extraction, extracts only fixed archive members, and rejects
redirected or drifted destination inputs.

This is CLI source-build acceptance on Windows x64, not a new installer release,
real-provider acceptance, Linux/ARM64 PTY support, or complete native Desktop
assembly acceptance. Desktop WGC fixed artifact reproducibility, fixed Node
distribution input and final resource/license assembly remain listed in
`docs/development/build-from-source.md`. CoWork's optional upstream closure is
not added. This commit can be reverted as a unit; reverting also restores the
previous missing-input limitation, and provenance must not be edited to bypass it.
