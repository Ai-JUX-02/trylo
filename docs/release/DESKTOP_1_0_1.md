# Desktop 1.0.1 — legacy CLI compatibility preview

Platform: Windows x64. Format: portable ZIP. Channel: unsigned preview.
Default protocol: `legacy-stream-json`.
Release: `desktop-v1.0.1`.
Download index: [result/desktop](../../result/desktop/).

## Runtime selection

The legacy CLI has its own entry, `cli-legacy/cli.cjs`. The new CLI remains at
`cli/dist/cmd/trylo/main.js`; discovering it cannot replace a legacy run.
Empty and historical default paths resolve to the correct bundled entry.
An explicitly configured user path is retained.

Normal runs, idle prewarm and learning shadow runs use the bundled Node interpreter.
The release CLI/Node resolver does not fall back to a build-machine source checkout.
Tauri resources are mapped explicitly to the installation root, matching the resolver.

The legacy compatibility runtime is the existing instrumented `2.1.88-trylo`
build. It is derived from Claude Code 2.1.88; it is distinct from the new Trylo CLI.
Its bundle preserves dependency license files and an attribution notice.
One embedded machine-local gateway credential was removed from the distributed
compatibility engine; users supply their own connection settings.
This release does not add the legacy engine source or the separate official
`runtime/cli.js` to the source repository, and makes no independent-authorship
claim about that compatibility engine.

## Build inputs

- Desktop/frontend and service host: built from this release's source in an independent copy.
- Desktop companion: rebuilt as self-contained Windows x64.
- Node: v24.14.1, bundled.
- CLI families: staged separately with dependency/file manifests and no-system-Node probes.
- WGC, PTY and sandbox helpers: existing pinned build inputs checked by their release gates.
- Work daemon: existing prebuilt artifact reused. Its 569 compiled JavaScript files
  matched the selected checkout build; Node ABI and the SQLite native binding were probed again.
  No fresh Work daemon source build is claimed.

To rebuild, prepare the existing product dependencies and native helper inputs.
Provide the instrumented legacy build through `TRYLO_LEGACY_CLI_DIR` (default:
a sibling `trylo cli/` directory). `prepare-sidecars.ps1` stages both CLI families.
An existing Work artifact can be supplied with `TRYLO_WORKD_ARTIFACT_DIR`; its
manifest, Node version, entry and SQLite binding must validate. Without that
override, the normal Work sidecar staging path is used.

The build environment needed a local esbuild 0.19.3 transport workaround:
large transform inputs were sent through its existing stdin channel instead of a
temporary file. The compiler executable/options were unchanged, pnpm store
hardlinks were preserved, and the local dependency file was restored afterward.

## Validation

- 92 focused Desktop runtime tests passed.
- 11 learning shadow runner tests passed.
- 9 Rust resource resolver tests passed.
- TypeScript and production Vite build passed.
- Service host build and tool bridge validation passed.
- Both CLI file inventories validated: 41,000 files before final installer extraction.
- The local simulated-model probe completed a legacy stream-json turn without system Node.
- Remaining artifact checks are recorded in `result/desktop/release.json`.

Three isolated Work daemon startup probes did not reach Control Plane readiness
within 35 seconds (including a probe retaining Windows system commands while excluding system Node). The diagnostic probe stopped while loading the existing
agent-daemon module. The native SQLite ABI probe passed, but that does not prove
daemon readiness. Managed Work startup remains an explicit open limitation;
this is separate from the validated legacy CLI conversation transport.

This is a compatibility preview, not a full-project acceptance result.
The five browser-profile contract failures recorded in the source checkpoint are
not closed by these focused checks. Clean-machine native installation, complete
tool availability, Android device behavior and real-model autonomous tasks remain
outside this release's acceptance evidence.

## Packaging outcome

The native application compiled successfully. NSIS packaging was interrupted after
resource/script generation and during installer compilation: this legacy runtime
closure contains roughly 94,000 files. No unfinished installer is published.
The release delivers a standard portable ZIP of the compiled application and the
same staged runtime trees. The ZIP is extracted and checked before publication.
