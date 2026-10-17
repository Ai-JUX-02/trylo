# Trylo

[English](README.md) | [简体中文](README.zh-CN.md)

Trylo is a personal learning agent project with a native desktop application, a TypeScript CLI, a Work surface, and an Android remote workbench.

**Status: alpha source checkpoint.** This update includes the new Trylo CLI source. The repository reorganization is in progress: current build paths are retained, while the proposed layout is documented separately. This is not a new installer release or a claim that every acceptance check has passed.

Windows desktop preview: [download and checksums](result/desktop/). The preview defaults to the legacy CLI; new CLI source remains included.

Current source defaults to `trylo-v1`. The October 16 update includes context, tool-history, native continuation and long-stream repairs, plus Desktop startup and presentation fixes. See [context and budgets](docs/architecture/context-and-budgets.md) and the [source verification checkpoint](docs/release/CURRENT_SOURCE_CHECKPOINT.md).

## Source map

| Directory | Responsibility |
| --- | --- |
| [new trylo cli](new%20trylo%20cli/) | Trylo CLI/TUI, execution, protocol, permissions, session recovery, and learning |
| [desktop](desktop/) | React + Tauri desktop application |
| [desktop-services](desktop-services/) | Local service host, tooling, browser, remote, and companion services |
| [new_tool](new_tool/README.md) | Windows-MCP fork source, tooling provenance and pinned dependency setup |
| [work](work/) | Workflows, managed-runtime adapters, and deliverables |
| [mobile-app](mobile-app/) | Android application and remote workbench |
| [trylocode-site](trylocode-site/) | Website source |
| [docs/architecture](docs/architecture/README.md) | Module boundaries, ownership, current wiring, and target structure |

The product architecture treats user learning, agent learning, and execution as distinct concerns. Learning proposals and evidence do not grant execution permissions. The architecture documents distinguish intended mechanisms from implemented and verified behavior.

## Development

Each application retains its existing manifest and lockfile. In the new CLI directory, install the locked dependencies with `npm ci`; `npx tsc -p tsconfig.json --noEmit` checks the TypeScript source.

For a Windows x64 CLI build, first run `node scripts/setup-cli-native.mjs --install` from the repository root, then `npm ci` and `npm run build` inside `new trylo cli`. The tracked PTY helper and digest-verified sandbox download are documented in [source build instructions](docs/development/build-from-source.md). Desktop packaging stages the CLI, Node, services, and native sidecars. Some of these acquisition/build steps still depend on local inputs and are being made reproducible. The repository is not yet a one-command clean-clone release build.

## Current limits

- Public source builds default to the new `trylo-v1` CLI and package no legacy engine. Explicit legacy protocol adapters remain for externally configured runtimes.
- Work's existing vendor/build closure and tests tied to historical evidence still need cleanup.
- The directory preview is a proposal, not the active runtime layout.
- Native desktop, installed artifacts, and Android device acceptance are recorded separately from source checks.

See [checkpoint details](docs/release/CURRENT_SOURCE_CHECKPOINT.md), [architecture](docs/architecture/README.md), and [migration order](docs/development/repository-layout.md).

Only the new CLI source is included. The legacy CLI, proprietary CLI distributions, research checkouts, credentials, raw sessions/recordings, and local build caches are excluded. Third-party components retain their own licenses and attribution.

First-party project code follows [Apache-2.0](LICENSE); see [NOTICE](NOTICE) and component-level provenance. Source updates, website deployment, and binary releases are separate operations.

Tool source restoration and checks: [2026-10-15 source audit](docs/release/SOURCE_COMPLETENESS_2026_10_15.md). From the repository root: `node scripts/release/check-source-completeness.mjs`; dependency setup: `node scripts/setup-repository-tools.mjs --install`.

Current source synchronization: [current checkpoint and verification](docs/release/CURRENT_SOURCE_CHECKPOINT.md). Existing Desktop R3 downloads are unchanged.
