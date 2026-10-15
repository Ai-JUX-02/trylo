# Source checkpoint validation

Date: 2026-10-15
Status: alpha source checkpoint; not a binary release.

## Checks actually run

- The frozen development copy's CLI full verification passed all 11 steps in 250.24 seconds: 3,923 hermetic test names and 38 contract tests.
- The actual public-source candidate's CLI full verification passed all 11 steps in 257.65 seconds, after adding its missing sandbox type-declaration closure.
- The public candidate uses the committed manifest and lockfile. Its check used three locally staged, provenance-hash-verified native/sandbox helper inputs; those helper binaries are not included in this source commit.
- Six upstream declaration files complete the sandbox adapter's TypeScript import closure. The initial missing-declaration error was preserved locally and corrected in the export; execution behavior was not rewritten.
- Product sources were selected by allowlist. The legacy CLI, proprietary runtime, research clones, raw sessions/recordings and private Git history were excluded.
- The known fixed synthetic secret fixtures were reviewed individually. The export scan found no unresolved credential-shaped or private development-path matches. This is a scoped source scan, not a claim of complete privacy or artifact-level supply-chain acceptance.
- Existing website download assets and public brand assets were retained. No new installer or APK release is created here.

## Not claimed

Full Desktop/Work/mobile acceptance was not rerun. The five previously observed Desktop browser-profile contract failures remain open. Desktop's default legacy route, Work vendor closure and historical-evidence-dependent tests remain documented work. Clean-clone release packaging, installed/native Desktop and Android device acceptance have not passed as part of this checkpoint.

The current directory names are retained. The reorganized tree described in docs/architecture is still the migration target.
