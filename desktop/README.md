# Trylo Desktop

Tauri 2 shell + Trylo React app + monaco-vscode-api. Long-term home for the Trylo agent system.

**The full technical plan lives in `C:/work/demo-ws/docs/ARCHITECTURE.md`.** Read that first. This README only covers the local dev loop.

## Stack

- **Tauri 2** — desktop shell (Rust + system webview)
- **React 18** — UI
- **TypeScript** — strict, see `tsconfig.json`
- **monaco-vscode-api** — VS Code services without the Workbench UI
- **monaco-editor** — the editor itself
- **Vite** — bundler/dev server
- **portable-pty** (Rust) — terminal
- **notify** (Rust) — file watcher

## Prerequisites

- Node.js ≥ 22
- Rust toolchain (install via `rustup` from https://rustup.rs)
- Tauri 2 system dependencies:
  - **Windows**: WebView2 (usually pre-installed on Windows 10/11)
  - **macOS**: Xcode Command Line Tools (`xcode-select --install`)
  - **Linux**: `libwebkit2gtk-4.1-dev`, `libssl-dev`, `libgtk-3-dev`, `librsvg2-dev`

## Local dev

```bash
# 1. Install JS deps
yarn install

# 2. Run the Tauri dev shell (opens the desktop app with hot-reload)
yarn tauri:dev
```

The first build is slow (Rust compiles the Tauri shell). Subsequent rebuilds are fast.
Resource staging can also take several minutes before the native window opens.

On Windows, `pnpm tauri:dev` first asks a previous Desktop instance from this
checkout to close, so Cargo can replace `target/debug/trylo-desktop.exe`. If that
window does not exit within ten seconds, startup reports its PID and stops without
force-killing it. Close the reported instance before retrying. The check does not
touch independent previews or applications from other checkouts.
If a Vite server already serves this checkout's current `src/main.tsx` at the
configured dev URL, the default entry reuses it. Otherwise Tauri starts Vite as
usual. Explicit `--config` arguments retain their configured dev command.

For Windows MSVC development, the default Cargo runner prepares the newly built
Desktop executable at Medium integrity before launching it, instead of inheriting
the checkout's Low label. An explicitly configured Cargo runner environment
variable is preserved. The development entry never selects High automatically
and does not change directory, system, or Git installation permissions.
An administrator development session can explicitly choose
`TRYLO_DESKTOP_INTEGRITY=H pnpm tauri:dev` in Git Bash after authorizing its model
tools to inherit administrator privileges. The same explicit choice can be saved
as `{"integrity":"H"}` in the ignored `.trylo/native-dev.json` file so ordinary
`pnpm tauri:dev` reuses it. An environment choice takes precedence; new checkouts
still default to Medium. High development mode is limited to this checkout's
debug executable.

## Build a production binary

```bash
yarn tauri:build
```

Outputs:
- `src-tauri/target/release/trylo-desktop.exe` (Windows)
- `src-tauri/target/release/bundle/dmg/*.dmg` (macOS)
- `src-tauri/target/release/bundle/appimage/*.AppImage` (Linux)
- `src-tauri/target/release/bundle/deb/*.deb` (Linux)

### Windows Git Bash startup

If a checkout inherits a Low integrity label, its built executable also starts
at Low integrity. Git Bash can then fail while initializing MSYS named objects
(`NtCreateDirectoryObject ... 0xC0000022`, process exit `0xC0000142`). After
building, prepare only the executable you intend to launch:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File ./scripts/prepare-native-executable.ps1 -ExecutablePath ./src-tauri/target/release/trylo-desktop.exe
```

The default label is Medium; the script preserves access permissions and rejects
paths outside this checkout or through reparse points. Run it again if a rebuild
replaces the executable. `-IntegrityLevel H` is an explicit option for a separately
authorized administrator preview; its model tools inherit that privilege. It is
never selected automatically. The normal application does not require High.

## Project layout

See `docs/ARCHITECTURE.md` §9. One-sentence version:

```
src/         — Trylo React app (UI + HostAdapter + state)
src-tauri/   — Rust shell (commands, channels, PTY, watcher)
spike-results/ — Phase 0 spike output
config/      — shared lint/format/typecheck config
```

## Code quality

See `docs/ARCHITECTURE.md` §10 for the full standards. Quick rules:

- TypeScript strict mode, no `any`
- `cargo clippy -- -D warnings` must pass
- One file per concept, < 300 lines preferred
- Comments explain WHY, not WHAT
- Tests for `host-adapter/` and Rust `commands/`

## Spike

Phase 0 is a 1-week spike (see `docs/ARCHITECTURE.md` §3 Phase 0 and `spike-results/`). Strict GO criteria; we stop if any fail.

## License

Apache-2.0 (TBD — see `docs/ARCHITECTURE.md` §12).
