# Trylo

[English](README.md) | [简体中文](README.zh-CN.md)

Trylo is a personal learning agent project with a native desktop application, a TypeScript CLI, a Work surface, and an Android remote workbench.

**Status: alpha source checkpoint.** This update includes the new Trylo CLI source. The repository reorganization is in progress: current build paths are retained, while the proposed layout is documented separately. This is not a new installer release or a claim that every acceptance check has passed.

## Source map

| Directory | Responsibility |
| --- | --- |
| [new trylo cli](new%20trylo%20cli/) | Trylo CLI/TUI, execution, protocol, permissions, session recovery, and learning |
| [desktop](desktop/) | React + Tauri desktop application |
| [desktop-services](desktop-services/) | Local service host, tooling, browser, remote, and companion services |
| [work](work/) | Workflows, managed-runtime adapters, and deliverables |
| [mobile-app](mobile-app/) | Android application and remote workbench |
| [trylocode-site](trylocode-site/) | Website source |
| [docs/architecture](docs/architecture/README.md) | Module boundaries, ownership, current wiring, and target structure |

The product architecture treats user learning, agent learning, and execution as distinct concerns. Learning proposals and evidence do not grant execution permissions. The architecture documents distinguish intended mechanisms from implemented and verified behavior.

## Development

Each application retains its existing manifest and lockfile. In the new CLI directory, install the locked dependencies with `npm ci`; `npx tsc -p tsconfig.json --noEmit` checks the TypeScript source.

Full CLI packaging also needs the pinned sandbox/native helper inputs recorded with their provenance. Desktop packaging stages the CLI, Node, services, and native sidecars. Some of these acquisition/build steps still depend on local inputs and are being made reproducible. The repository is not yet a one-command clean-clone release build.

## Current limits

- Desktop retains legacy protocol adapters and currently defaults to the legacy route. The new `trylo-v1` route exists; the default migration is unfinished.
- Work's existing vendor/build closure and tests tied to historical evidence still need cleanup.
- The directory preview is a proposal, not the active runtime layout.
- Native desktop, installed artifacts, and Android device acceptance are recorded separately from source checks.

See [checkpoint details](docs/release/CURRENT_SOURCE_CHECKPOINT.md), [architecture](docs/architecture/README.md), and [migration order](docs/development/repository-layout.md).

Only the new CLI source is included. The legacy CLI, proprietary CLI distributions, research checkouts, credentials, raw sessions/recordings, and local build caches are excluded. Third-party components retain their own licenses and attribution.

First-party project code follows [Apache-2.0](LICENSE); see [NOTICE](NOTICE) and component-level provenance. Source updates, website deployment, and binary releases are separate operations.
