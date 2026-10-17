# Windows x64 PTY helper

`win-x64/trylo-pty.exe` is a tracked first-party build input, not a developer cache.
Its exact size and SHA-256 are recorded in `PROVENANCE.json`; `scripts/pty/copy-pty-vendor.mjs`
verifies them before staging. Source is `src/main.rs`, with `Cargo.toml` and `Cargo.lock`.

The recorded build used Rust 1.97.1 for x86_64-pc-windows-msvc. To investigate or
rebuild, run `cargo build --release --locked` here with the Windows MSVC toolchain.
A new machine needs Cargo registry access first. A rebuild with a different toolchain
is not assumed to have identical bytes; do not rewrite provenance to bypass validation.

See [source build instructions](../../../docs/development/build-from-source.md)
for sandbox helper acquisition and the boundary between CLI checks and Desktop packaging.
