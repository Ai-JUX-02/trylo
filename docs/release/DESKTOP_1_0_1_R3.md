# Desktop 1.0.1 R3 - core distribution and optional CoWork

The default Windows desktop download is now 219,903,437 bytes (about 220 MB),
down from R2's 367,231,006 bytes and the original 593,012,640 bytes.
CoWork is a separate 147,329,034-byte experimental dependency ZIP.

Ordinary Work already uses `sendWorkChat -> ConversationRunSupervisor.runCode`
and Trylo CLI. App no longer creates a Control Plane/WorkRuntime lifecycle or
starts workd; the reference production frontend contains no daemon startup caller.
Removing the dormant backend therefore leaves normal Work, its tool profiles,
artifacts, previews and CLI wiring intact. The native executable, CLI payloads,
services, Node and compressed pet are byte-identical to R2.

## Default build and packaging

- `desktop/distribution.json` identifies the core profile and excludes CoWork.
- Default sidecar preparation skips CoWork import/build/prune/probes and its wrapper.
- Tauri resources omit both `work/` and `workd/`.
- The portable packager uses explicit component roots; stale staged Work files
  cannot re-enter core. No Node binary is duplicated in the dependency ZIP.
- Core inventory requires 16 actual dependencies. It does not require the optional
  daemon; explicit maintenance checks still reject a missing dependency.

```powershell
# Main desktop package; no CoWork source/dependency build is invoked.
powershell -NoProfile -File desktop/scripts/prepare-sidecars.ps1
python desktop/scripts/package-portable.py

# Maintenance only: prepare/package the separate experimental daemon.
powershell -NoProfile -File desktop/scripts/prepare-sidecars.ps1 -IncludeWorkd
python desktop/scripts/package-portable.py --component cowork
```

A fresh checkout must prepare the same pinned core inputs and build the native
Desktop executable first. This revision repacks the existing Desktop 1.0.1 binary;
it does not claim a native executable rebuild. See [1.0.1 inputs](DESKTOP_1_0_1.md).

## Artifact validation

- Core: all 41,228 entries extracted and passed CRC; no work/ or workd/ runtime.
- Both CLI inventories passed (2,716 new + 38,284 legacy files).
- 41,226 retained core payload files match R2. Native Desktop, Node and pet hashes match.
- Actual extracted core inventory passed 16/16 without CoWork.
- Negative checks reject explicitly requested missing CoWork and a missing pinned
  Node; the Node test rename was restored before process-level checks.
- Extracted core CLI completed one local simulated-model turn, with exactly one
  successful legacy result frame and no system Node.
- Dependency: all 28,469 entries extracted/CRC-checked; its 28,467 retained payload
  files match R2 and all 12 native bindings are unchanged.
- Dependency SQLite, Sharp, both Canvas versions, Excel, Word, PPT and PDF probes
  passed using the Node interpreter from the separate core directory.
- Desktop/pet/services and frontend behavior were not changed. R2's native pet
  rendering evidence is retained by identical payload hashes, not reported as a new R3 UI test.

The CoWork dependency has not passed Control Plane startup readiness or managed
real-task acceptance. That old failure is outside the default core download.
This edition has no in-app dependency installer/activation UI; extracting the
experimental archive does not enable a background-task feature. Ordinary Work
never needs this dependency. Future activation must wait for readiness/task repair.

The original five browser-profile contract failures remain open. Full native Desktop
UI, clean-machine installation and real-provider acceptance are not claimed.
Android and website artifacts were not changed.

See [runtime boundary](../architecture/OPTIONAL_COWORK_RUNTIME.md),
[download index](../../result/desktop/) and
[experimental dependency](../../result/desktop/dependencies/).
