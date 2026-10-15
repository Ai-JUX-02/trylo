# Public source completeness audit, 2026-10-15

Status: source omissions repaired; complete product/native acceptance is separate.
Scope: the existing public product snapshot, audited against the isolated development
copy and the Desktop R3 core payload. No changes to the original development tree.
No new Desktop binary, mobile binary or website deployment is made in this commit.

## Defects repaired

1. `new_tool/` was ignored wholesale. Only the three WGC C# project/source files
   were explicitly published, while packaging and the package manager still read
   the omitted Windows-MCP Python fork. Restored all **107 Python runtime modules**,
   **71 Python test files**, the existing version-check script, project metadata,
   Python version pin, unchanged uv lock, MIT license and source provenance.
2. The root `tool-sources.json` was missing even though the tool bridge requires it.
   Added the four repository-local entries and a setup command that uses the
   existing pinned/hash-verified transports. The public checkout now materialises
   dependencies under ignored `new_tool/packages/`, rather than relying on the
   private workspace's existing clone/build paths. No global tool configuration
   or provider settings are changed. Browser bodies and CAD hosts remain separate.
3. All five icon files named by Tauri's `bundle.icon` were omitted. Restored them,
   the existing 1024px source image and the existing generation recipe. The recipe
   now writes beside itself instead of an absolute developer checkout path.
4. Two sandbox vendor source inputs were omitted: delayed
   `windows-persistent-ca.js` and `sandbox-schemas.d.ts`. Restored the existing
   files without altering their implementation. This does not enable TLS/MITM
   inspection or add node-forge; the existing restricted runtime closure remains.
5. `prepare-sidecars.ps1` queried `resources` before creating it, so a clean
   checkout failed immediately. It now creates the validated directory and runs
   the source-input gate before doing expensive builds. Its WGC build instruction
   also names the actual checked-in project path.

The ignore rules now expose only the intended fork source/metadata and required
icons. Private tool instructions, `.venv`, caches, downloads, npm environments,
compiled helpers and recordings remain outside the source commit.

## Checks actually run

| Check | Evidence/result |
| --- | --- |
| Existing fork-presence contract against the old public baseline | Fails with `fork src/windows_mcp must exist` after locked dependencies are installed |
| Existing tool bridge against the old baseline | Fails on missing root registry |
| Restored fork vs extracted R3 core | All 107 normalised source hashes match |
| New source gate fault injection | Missing registry, OCR module, ICO, delayed sandbox module, type declaration, and changed Python digest all rejected (6/6) |
| Clean `resources` initialisation | The old script prefix fails; the new prefix creates the directory and passes |
| Four repository tool packages | Actual install succeeded for OfficeCLI 1.0.145, Playwright MCP 0.0.79, Windows-MCP 0.8.5 and Chrome DevTools MCP 1.8.0; subsequent availability and required-local-build gates pass |
| Service source bundle | esbuild succeeds; `--bundle --require-local-builds` validates all five profiles |
| CLI full quality gate | All 11 steps pass in 234.01 seconds, including 38 contract tests, 3,923 hermetic test names, architecture, source scan and license/SBOM checks |
| Installed Windows-MCP console entry | Real stdio handshake advertises exactly the 14 manifest-allowed tools; harmless Wait call completes |
| Restored Python source | 193 tests pass across eight selected files, including actual stdio handshake/tool listing and a harmless Wait round trip |
| Static import audit | AST scan of 2,471 tracked JS/TS files finds zero unresolved production imports and zero unresolved test imports outside archived legacy smoke scripts |
| Changed-source scan | 179 Python files parse; no unresolved credential-shaped or private developer-checkout-path findings |
| Git export | The final index is exported without dependencies/build outputs and checked independently before publication |

CLI verification used three existing native helpers whose bytes were first
verified against the checked-in sandbox/PTY provenance. Those build-machine
inputs are not added to Git. The first Python test attempt used the existing
private virtual environment and failed before tests because its temporary-file
I/O was unavailable. A newly materialised, locked environment loaded the public
candidate source and passed the 193-test run; the first failure is retained.

## Remaining boundaries and known failures

- `git diff --check` reports existing trailing whitespace/blank EOF lines in the restored third-party fork. Those deployed bytes are deliberately retained and bound to the R3 source inventory; the independent check of first-party edits passes. This warning is recorded, not presented as an all-source formatting pass.
- The selected Desktop Services contract run is **105 passed / 1 failed** out of
  106. `tooling-pr7.test.mjs` still expects only the manifest browser argv while
  composition adds headless/viewport/CDP args. The same test fails against the
  unchanged pre-commit public source. Its failure was neither suppressed nor
  repaired as part of source restoration; the earlier broader browser-profile
  failures are not claimed resolved.
- There are 109 unresolved relative import references in archived
  `desktop-services/tests/legacy/*.js` smoke scripts. Their corresponding modules
  exist under `vendor/legacy`; those scripts retain old migration paths. They are
  recorded as historical test debt, not silently counted as passing or copied
  into a duplicate runtime tree. Captured/private recordings are not published.
- The complete upstream CoWork source/build closure remains outside the core
  edition; CoWork is still the separate experimental dependency selected for R3.
- Sandbox helper binaries, the PTY artifact, WGC's exact pinned publish output,
  the pinned Node runtime and the legacy CLI distribution remain explicit build
  inputs. This is not a one-command clean-machine Desktop release acceptance.
- No full native Desktop GUI, full Windows-MCP suite, browser action session,
  real-provider task or mobile-device acceptance was performed by this audit.

## Review and rollback

The change restores already deployed source and makes dependency preparation
explicit. It does not change the agent loop, permissions, learning ownership,
provider selection or default CLI runtime. The sandbox files are byte-preserving
restorations. No npm dependency or approved capability is added. The existing MIT
fork attribution is retained separately from Trylo's Apache-2.0 project license.

Readability/maintainability review: the setup entry delegates downloads and
installation to the existing package manager; source checking owns source-input
presence/integrity only; artifact/native acceptance remains in existing gates.
The fork inventory is tied to this release snapshot. Fork edits require updating
`PROVENANCE.json` together with their tests and source review.

Rollback is a normal revert of this source-restoration commit. The original
workspace and previously published release archives are untouched.
