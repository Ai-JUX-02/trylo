# Trylo tool sources and dependencies

Trylo's tool registry, installers, health checks and profiles live in
[`desktop-services/src/tooling`](../desktop-services/src/tooling/). Built-in
agent tools live in `new trylo cli/src/internal/adapters/tools`.

| Component | Public source / acquisition |
| --- | --- |
| Windows-MCP Trylo fork | `computer-control/Windows-MCP`: Python source, tests, lockfile, MIT license, provenance and native helper source |
| OfficeCLI | Official 1.0.145 executable, pinned URL and SHA-256 in `manifests/officecli.mjs` |
| Playwright MCP | 0.0.79 plus the exact Playwright dependency closure, pinned tarballs and hashes in `manifests/playwright.mjs` |
| Chrome DevTools MCP | 1.8.0 self-contained npm artifact, pinned tarball and hash in `manifests/chrome-devtools.mjs` |
| CAD / EDA tools | Six optional manifests alongside the above; host applications remain separate prerequisites |

## Prepare a source checkout

From the repository root on Windows with Node >=22 and uv installed:

```powershell
node scripts/release/check-source-completeness.mjs
node scripts/setup-repository-tools.mjs --install
node scripts/setup-repository-tools.mjs --check
cd desktop-services
node scripts/validate-tool-bridge.mjs --require-local-builds
```

`--install` uses the existing digest-verified package manager, not floating
`latest` versions. Downloads and generated Python/npm environments go under
ignored `new_tool/packages/`. `tool-sources.json` points at those exact local
entries. Before installation a source checkout honestly reports the tools as
unavailable; it cannot use a developer's old executable by accident.

The old private workspace used direct clone/build paths under `browser/` and
`office/`; those unmodified upstream checkouts, local binaries, caches and
virtual environments are not product source. Their replacement here is a
repeatable pinned installation path. The Windows-MCP fork must be public
because the package manager overlays Trylo's changed Python code after the
upstream download; the tarball alone is insufficient.

Playwright's Chromium body is installed separately through the existing
browser tooling flow. Chrome DevTools needs a supported system Chrome.
Tool installation does not prove a browser, CAD host, capture session or
real-provider task works. See the [source audit](../docs/release/SOURCE_COMPLETENESS_2026_10_15.md)
for verification and remaining build inputs. CoWork remains an optional,
experimental dependency and is unrelated to this tool directory.
