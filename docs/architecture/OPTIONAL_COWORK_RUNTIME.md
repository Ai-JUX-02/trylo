# Ordinary Work and optional CoWork runtime

Ordinary Work executes through `sendWorkChat -> ConversationRunSupervisor.runCode`
and the bundled Trylo CLI. Its `work.core.v1` tool profile, file/artifact projection
and renderer helpers remain part of Desktop. No daemon is started on mounting the
Work UI. The retired control-plane modules are not part of the production startup graph.

CoWork is a separate experimental background-task backend. The core distribution
manifest (`desktop/distribution.json`) declares it excluded and not required by
ordinary Work. Its dependency manifest lives in
`desktop/optional-dependencies/cowork-runtime.json`.

## Release boundary

1. Default sidecar preparation skips CoWork build, import, pruning and ABI probes.
2. Default Tauri resources omit `work/` and `workd/`.
3. The portable packager uses explicit component roots, so stale staged files cannot
   leak back into the main download. It builds the daemon only as `--component cowork`.
4. Core inventory still requires Node, services, WGC, the pet and helpers. It does
   not require a missing optional backend. Explicit `TRYLO_INCLUDE_WORKD=1` enables
   maintenance checks and fails if the dependency is absent.
5. Core and dependency ZIPs have separate checksums, manifests and download links.
   The dependency reuses core's exact Node v24.14.1 instead of duplicating Node.

## Product status

This edition has no in-app dependency installer or activation switch. The existing
daemon still has an unresolved cold-start failure. Its ZIP is an experimental
maintenance archive, not a ready background-task feature. Ordinary Work should never
show an install requirement for it or wait for its readiness.

Legacy adapters and historical transcript support stay in source so future repair
and history rendering do not require deleting or recreating integrations. A future
activation feature needs package/hash/Node-ABI validation, readiness and real managed
task acceptance before it can be exposed to users.
