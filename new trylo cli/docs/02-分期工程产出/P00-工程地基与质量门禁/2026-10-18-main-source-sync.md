# Source synchronization, 2026-10-18

## Scope and provenance

Public parent: `71538b4441923d0e432d154b597f8ccc43e251e0` (merged PR #4), including PR #2 and native-input preparation commit `87bb99f`.
Main development baseline: `f2da9f022be6873b577c2e44c029ffc68b722c3f`.
Main source checkpoint before reverse integration: `ddeb842f8da8eb1c7948827fcf3ab670aa3b83ee`.

The main development work was frozen and validated before its checkpoint commit.
Public repairs were then integrated back into that directory with exact before/after
hash guards. The public candidate starts from the public parent and three-way merges
the frozen development delta; it does not replace public main with a private history.

The update contains explicit memory lifecycle and storage governance, bounded local
memory/file commands, native continuation provenance and durable notices, Desktop
memory records, remote ownership/pairing/restart repairs and mobile 1.5.1 metadata.
See [module behavior](../../../../docs/architecture/memory-continuation-update.md).

## Conflict and review decisions

Only the Tauri resource map conflicted. The public core-only resource layout,
distribution metadata and fixed resource-root mapping were retained; the update
does not restore optional CoWork to the default bundle. Main local development
configuration remains distinct and is backed up in the local synchronization audit.

Two pairing files received small lint repairs: strict null checks, a stable cleanup
callback and typed complete pairing fixtures. Their original source and the first
lint failure remain in the local audit; no behavior or permission contract was relaxed.

Public PR #2 / #4 summary completion, cancellation, tool evidence and untrusted-history
behavior is preserved. No new dependencies or public budget semantics were introduced.
Mobile installed dependency entries are unchanged; its app version metadata advances.

Raw Debuglog directories, model/session recordings, credentials, private acceptance
archives, dependency caches, build output, old CLI and research checkouts are excluded.
Internal native/model closeout reports remain local rather than claiming acceptance
for this newly merged source. A self-contained architecture note is published instead.

## Current verification

- Main development checkpoint: CLI verify all 11 steps, 4170 hermetic test names.
- Public merged candidate: CLI verify all 11 steps, 4199 hermetic test names.
  Counts name the gate's inventory, not an assertion that optional live tests ran.
  The pipeline also runs 38 contract checks, type/architecture/transition checks,
  license/SBOM and source scanning.
- Desktop: 35 affected files, 339 assertion passes and 1 existing real-provider skip.
  The initial missing pinned Playwright case was rerun unchanged with its exact
  previously verified dependency, then combined with the original passing results;
  this was not a second run of all 35 files. The four pairing regressions were also
  rerun after the lint repair.
- Desktop affected-file lint: passed after the two-file repair. App: 0 errors and
  9 pre-existing hooks warnings, no new warnings. Complete final typecheck passes.
- Desktop production frontend build passes; its source map binds nine critical
  modules to the candidate's final bytes. Mobile typecheck and production build pass.
- Mobile UI: 23/23; remote transport: 13/13. Services remote/browser focused group:
  39/39. Source completeness: 168 input checks, 107 fork modules, 10 tool manifests.
- Existing sandbox and PTY build inputs match their fixed hashes. Native Rust
  `cargo check --offline` passes in source-only mode; see the resource-lock limit below.

## Preserved initial failures and limitations

The first CLI audit wrapper put temporary test directories inside Git, invalidating
outside-repository tests. A second inherited Windows 8.3 TEMP alias differed from
canonical cwd in three exact-path tests. Original logs remain; resolving the same
external system temporary directory to its long name fixed the environment. The
affected 30 cases and both complete final pipelines passed without editing assertions.

The first Desktop check lacked pinned Playwright; its initial failure is retained.
The network preparation action's automatic permission review timed out; preparation
instead reused a local package already verified in the prior native-input/source
checkpoint. Its current manifest and installer bytes match exactly. No floating npm
install or browser-body download was used.

The first native check reached resource copying and met a live-file sharing lock.
The successful retry sets `TAURI_CONFIG` only in the child process to an empty resource
list and checks Rust source. It does not prove native resource assembly or installation;
the user's running application was not terminated and its configuration was not edited.

No installer/APK was rebuilt, no native window/device acceptance was rerun, and this
sync does not claim a new real-model benchmark. Previously reported native/model
evidence belongs to its own frozen artifacts. Lossy compaction and bounded literal
intent parsing retain their documented limits.

Main reverse integration was rebuilt successfully and passed 78 focused regressions;
1552 first-party CLI TypeScript source/test files match the fully verified public
candidate after the existing LF/path canonicalization.

The reviewed code keeps existing ownership boundaries and passes readability and
maintainability self-review. Revert this public source update to return to its parent;
do not downgrade a writer over newer facts data or erase user records during rollback.
