# Windows-MCP: Trylo fork

This is the existing Trylo-maintained fork, based on CursorTouch/Windows-MCP
0.8.5 at `83e17f622597dd5b10a09fa34ffe0b8686dbc7eb`. It is third-party-derived
MIT code; see [LICENSE.md](LICENSE.md) and [PROVENANCE.json](PROVENANCE.json).
The Python source is the same 107-file tree staged in Desktop 1.0.1 R3.

Trylo changes include OCR/display inventory, CAD input and focus/IME handling,
coordinate and snapshot/UIA fixes, capture/broker integration, takeover,
watchdog and action-result handling. The provenance inventory hashes UTF-8
source with LF line endings so normal Git checkout conversion is harmless.

## Development

Windows, uv and Python 3.14 are required (`.python-version` pins 3.14.7).
From this directory:

```powershell
uv sync --locked --extra dev
$env:ANONYMIZED_TELEMETRY = 'false'
uv run --no-sync python -m windows_mcp serve --transport stdio --tools Screenshot,Snapshot,DisplayInventory,Click,Type,Scroll,Move,Shortcut,Wait,WaitFor,App,MultiSelect,Clipboard,Ocr
```

`uv.lock` is the unchanged upstream lock and agrees with the Desktop manifest.
For Desktop's pinned tool install use `node scripts/setup-repository-tools.mjs
--install` from the repository root instead. The existing package manager
verifies the upstream source/dependency pins, then overlays `src/windows_mcp`.

Tests under `tests/` are retained with their implementation. Windows desktop,
input/capture integration and clean-machine acceptance require their respective
environments; publishing the tests does not claim they all passed.

## Native WGC helper

From the repository root:

```powershell
dotnet publish new_tool/computer-control/Windows-MCP/native/wgc-helper/TryloWgcHelper.csproj -c Release -r win-x64 --self-contained -p:PublishSingleFile=true
```

The .NET 8 Windows targeting packs are required. Desktop stages the publish
output and checks its digest against the existing helper pin. A fresh build
with a different SDK/runtime may differ; do not bypass that artifact check.
