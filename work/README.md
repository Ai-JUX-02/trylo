# Trylo Work

Ordinary Work is the document/artifact surface inside Trylo Desktop. It shares the
CLI execution path with Code. It does not require the CoWork daemon.

```text
Work UI -> sendWorkChat -> ConversationRunSupervisor.runCode -> Trylo CLI
                                |                              |
                         work.core.v1 profile          Desktop tool services
                                |
                       WorkResultProjector -> artifacts

Optional experimental package (not in the core download):
work/bin/trylo-workd.mjs -> workd/dist/daemon/daemon/main.js (CoWork)
```

`desktop/src/App.tsx` no longer creates a WorkRuntime/Control Plane client or
starts workd. The production frontend does not include its startup caller.
Normal Work still has its chat, attachments, tool profiles, artifact scanning,
previews and result UI. Do not remove `work/src`: the frontend imports its prompt
and renderer helpers through the `@trylo/work` alias.

## Core and experimental dependency

| Component | Default desktop download | Role |
| --- | --- | --- |
| `work/src` helpers | Compiled frontend helpers | Ordinary Work prompt/artifact UI |
| Trylo CLI + Node | Included | Code and ordinary Work execution |
| CoWork daemon + its `node_modules` | Excluded | Optional background-task experiment |
| `work/bin/trylo-workd.mjs` | Excluded | Compatibility launcher for that experiment |

The default `prepare-sidecars.ps1` does not build or stage CoWork. Use
`prepare-sidecars.ps1 -IncludeWorkd` only to prepare the separate experimental
dependency, then `python desktop/scripts/package-portable.py --component cowork`.
The normal Tauri resource configuration and default portable packager exclude both
`work/` and `workd/`, even if an older build left them in the staging directory.

The dependency ZIP is a maintenance/evaluation download. Its existing Control Plane
cold-start probe has not passed. Desktop has no installer or activation UI for it
in this edition; downloading/extracting it does not enable background tasks.
Repair and verify that runtime before adding product activation again.

See [optional-runtime boundary](../docs/architecture/OPTIONAL_COWORK_RUNTIME.md) and
[result/desktop](../result/desktop/) for the separate download and validation.

## Source layout

- `src/renderer`, prompt and artifact helpers: used by ordinary Work.
- `src/work-runtime.ts`, control-plane adapters and `bin/`: retained experimental compatibility code.
- `vendor/cowork-os`: reviewed vendor patches and external build inputs for the optional daemon.
- `tests/`: helper, protocol and compatibility contracts; these do not all represent active product routes.

## Vendor patches

`vendor/cowork-os/` is a supply-chain copy and is **git-ignored by default**.
Trylo keeps only its reviewed compatibility/runtime patch files visible to Git
so a fresh checkout cannot silently lose the integration fixes:

- `src/electron/control-plane/task-event-bridge-contract.ts` extends the event
  allowlist with `llm_usage` and `context_compaction_started|completed|failed`.
- `src/daemon/control-plane-methods.ts` returns the new task id before
  execution begins, forwards follow-up permission/shell fields, and
  acknowledges long-running continuations immediately instead of holding an
  RPC open until the whole task finishes.
- `dist/daemon/daemon/control-plane-methods.js` is the compiled runtime copy
  used by `coworkd-node.js` when the daemon has already been built.
- `src/runtime/managed/*` is the headless-safe solo ManagedSession core used by
  the daemon and the Electron facade.
- `src/electron/managed/ManagedSessionService.ts` composes that core for solo
  sessions while retaining team/studio/media concerns in the Electron shell.
- `src/electron/media/media-token-store.ts` keeps token generation independent
  from Electron protocol registration so ManagedSession tests can load in Node.
- The corresponding daemon/Electron compiled files under `dist/` are retained
  because the packaged launchers may execute an already-built vendor runtime.
- `../desktop-services/vendor/legacy/remote-gateway/index.js` carries the
  additive Trylo P3 patch (2026-09-06, no longer byte-identical): `surface`
  forwarding in `POST /v1/chat/messages` plus read-only `GET /v1/artifacts`
  and `GET /v1/artifacts/content?path=` (Desktop-authored, gateway only
  sanitizes shapes and streams bytes; 12MB content cap). `no-external-paths`
  and `smoke:legacy-gateway` still pass; artifact routes are covered by
  `desktop-services/tests/services/remote-gateway-artifacts.test.mjs`.

The corresponding exceptions live in the repository `.gitignore`. When the
upstream checkout is refreshed, reapply and review these files, run both
`npm run build:daemon` and `npm run build:electron`, then run Trylo's vendor
protocol and ManagedSession contract tests.

## License

The vendor content under `vendor/cowork-os/` retains its original CoWork-OS MIT license (see `vendor/cowork-os/LICENSE` after Phase 1 copies it in). Everything else in this folder is Trylo's.
