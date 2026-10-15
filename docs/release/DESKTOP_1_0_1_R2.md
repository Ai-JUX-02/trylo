# Desktop 1.0.1 R2 - smaller portable package

This is packaging revision 2 of the Windows x64 unsigned preview. The native
Desktop executable, service host and both CLI payloads are unchanged from 1.0.1.
The pet was republished with its existing source. Website and Android files are unchanged.

| Compressed payload | Original (MiB) | R2 (MiB) |
| --- | ---: | ---: |
| Background-task Work daemon | 281.49 | 135.15 |
| Desktop pet including .NET/WPF | 99.40 | 69.65 |

The whole download is 593,012,640 -> 367,231,006 bytes (38.07% smaller).
Component sizes exclude ZIP file headers. See [size comparison](../../result/desktop/size-comparison.json).

## Packaging changes

The Work packaging pass removes source maps, non-runtime type declarations and
package-root development folders. It preserves TypeScript compiler library declarations,
all package manifests, notices, document/font assets and all 12 native bindings.
A conservative literal-import resolution check restores referenced files. Nested
package versions have distinct resolution contexts; the missing-entry regression
failed before the cache fix and passed afterward. The final policy preserves all
nested folders such as ExcelJS `lib/doc`; its runtime code is not documentation.
The background daemon source and compiled runtime code were not rewritten.

The companion remains self-contained. It uses [.NET compressed single-file publishing](https://learn.microsoft.com/en-us/dotnet/core/deploying/single-file/), without a trimming pass.
All 22 images stay external because existing code loads them from AppContext.BaseDirectory.
English and Chinese runtime resources are retained. The exact bundled .NET 9.0.12
runtime license/notice files are distributed under the companion's `licenses/dotnet`.
Fresh publish/staging directories prevent old loose runtime DLLs from leaking back in.
Previous runtime trees are preserved outside bundle.resources.

ZIP Deflate compression now defaults to level 6 instead of 1. No new runtime format
or extractor is required. The Node runtime is pinned before Work ABI/import probes.
The normal release preparation path now runs the pruner and native/document probes.

## Validation of the distributed ZIP

- All 69,694 entries extracted and passed CRC checks.
- Both CLI inventories passed: 2,716 new CLI files and 38,284 legacy files.
- 41,199 Desktop/CLI/service/runtime files match the original payload.
- 28,464 retained Work files match the original, including all 12 native bindings.
- All 764 original Work license/notice files are retained byte for byte.
- From the extracted ZIP and empty PATH: legacy CLI completed one local simulated
  Anthropic SSE turn with exactly one successful result frame.
- From the extracted Work package and pinned Node: SQLite, Sharp, both Canvas
  versions, Excel, Word, PowerPoint and PDF round trips passed (7 probe groups).
- Compressed pet permission and hover states rendered in native WPF. The permission
  render from the extracted ZIP is byte-identical to the original render. External
  image hashes match. User pet settings were restored after the QA invocations.

The initial compressed-pet candidate failed because its atlas/background images were
embedded while the existing loader expected external paths. That candidate was not
published; explicit external-content metadata and an asset gate fixed it.

The original five browser-profile contract failures remain open. The 92 Desktop,
11 shadow-runner and 9 Rust checks in 1.0.1 are prior source evidence, not new R2 runs.
A fresh isolated 35-second Work daemon probe still did not reach a listening Control
Plane. Package-level document probes do not establish managed-task readiness.
Full interactive tray behavior, the complete native Desktop UI, clean-machine
installation and real-provider autonomous tasks are not claimed by this revision.

## Rebuild

Use the same pinned inputs described in [1.0.1](DESKTOP_1_0_1.md).
Run `desktop/scripts/prepare-sidecars.ps1`, then package the already-built native
application with Python 3.10+:

```powershell
python desktop/scripts/package-portable.py --output result/desktop/Trylo-Desktop-1.0.1-windows-x64-portable-r2.zip
```

This revision reuses the native Desktop 1.0.1 executable. A fresh checkout must build
that executable before packaging; the packager refuses missing inputs and existing
output files. Source changes to Desktop itself require rebuilding it.
