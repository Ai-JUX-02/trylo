# Main source synchronization, 2026-10-15

The public source now defaults to the new Trylo CLI (trylo-v1). This imports
the selected product-source fixes from the main working tree at
86d4e6ba4ce9bd17eb532bae25e4b46a9b16977f; that tree contained uncommitted work.
The isolated reference, rather than the original working tree, is the release
editing and verification location. The source snapshot covers 2,957 files;
the final comparison found no changes to those files during verification.

## Source and distribution changes

- Synchronize 35 main-source files, including connection persistence and
  model selection, reasoning summaries, stream integrity, run lifecycle,
  native browser profiles, and their regression fixtures.
- Make trylo-v1 the source default for fresh Desktop settings. Preserve an
  explicitly configured external legacy protocol for compatibility.
- Publish the new CLI source only. Remove the legacy staging script and
  legacy engine resource mapping. Future portable archives use an explicit
  new-CLI-only resource list, even if a local resource directory contains
  stale legacy engine files.
- Retain the previous CoWork optional dependency split and tool-source
  completeness fixes. This synchronization changes neither the website nor
  mobile assets. Private environment files and provider credentials remain
  excluded.
- Restore the small synthetic legacy-protocol read fixture required by the
  parity test. It is a controlled loopback trace, not legacy CLI source or an
  executable. Normalize its private temporary paths.
- Update the CLI golden trace to require the new tool-result name and
  duration metadata; duration remains normalized for deterministic comparison.

The existing result/desktop R3 download is unchanged. Its recorded legacy
default is historical artifact behavior. No newly compiled native Desktop
application, APK, or replacement download is claimed by this source update.

## Verification

| Check | Result and scope |
| --- | --- |
| New CLI full engineering gate | All 11 steps pass, 449.01 seconds; 38 contract tests and 3,935 hermetic test names, strict typecheck, layering, transitions, license/SBOM and source scan. |
| Desktop selected regressions | Recovery run: 112 pass, one failed provider probe and one skipped parity case while a parallel CLI build replaced shared dist. Both affected cases subsequently pass against a separately staged, immutable CLI. |
| Browser profile process integration | Four cases pass in the earlier run; the affected Code ask case subsequently passes against the immutable CLI. Tests exercise headless Chromium/CDP, approval and scoped MCP wiring with controlled providers. |
| Staged CLI smoke | Dependencies resolve with a scrubbed PATH, one approval precedes a write, and one terminal event is observed. |
| Source completeness | 160 build-input checks, 107 Windows-MCP fork modules and 10 tool manifests pass. |
| Desktop frontend build | TypeScript build passes. Vite fails twice while esbuild tries to remove its temporary input (Access is denied), including a retry with an isolated child TEMP/TMP. A completed frontend bundle is not claimed. |
| Tool bridge | Service bundle and gate with --require-local-builds --bundle pass; all four pinned repository tools are installed in the private validation copy. |
| Portable resource selection | Synthetic fixture proves that stale cli-legacy files are excluded and the new CLI entry is included. This is a packaging selection check, not a native app build. |
| Services targeted tests | 89 pass, one existing tooling-pr7 argv assertion fails: native-browser startup adds headless, viewport and loopback CDP flags absent from the old expectation. This failure is retained; a full green services suite is not claimed. |

The first CLI run failed on an outdated golden trace and a broken WSL Bash
launcher. The golden expectation now asserts the producer metadata. The full
recovery uses Git Bash through a child-process-only PATH prefix; global shell,
provider selection and credentials were not changed.

The first Desktop passes also exposed a missing public fixture and old
default expectations. These were corrected. Later verification overlapped a
CLI build which cleaned the same dist directory; affected integration cases
were rerun against a frozen staged artifact. First-run and recovery evidence
are retained separately in the local release audit.

The frozen staged CLI inventory has 2,720 files. Its files.json SHA-256 is
b1db8eaa82f66c6a7445295fe930f5d511cbbe8370ba8cb0bfa66f9822c225c3.
The pinned Node runtime is v24.14.1 with SHA-256
58e74bf02fc5bbacc41dcb8bef089961cd5bddd37830b87784e4fc624d145d1f.
Downloaded tools, local native helper binaries, build directories and raw
test logs are private validation inputs, not source publication additions.

## Acceptance boundaries and follow-up

Native WebView2/Desktop-window, installed-app, device, external-network and
real-provider acceptance remain separate. Historical engineering records
remain dated records; this document supersedes their source-default status.
The existing services argv assertion and other previously documented
history-dependent acceptance scripts are still open work.

Synchronization is an explicit reviewed snapshot operation. No filesystem
watcher, scheduled task or automatic push hook is installed by this update.
