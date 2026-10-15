# Trylo CLI

Trylo's TypeScript CLI/TUI implementation. This is the only CLI engine source in this public repository.

The current directory name is retained for build compatibility. The proposed public layout renames it to trylo-cli after consumers and packaging are migrated together.

- src/cmd/trylo: executable composition
- src/internal/domain, ports, loop: canonical state, contracts and execution
- src/internal/surface: terminal and stdio protocol adapters
- src/internal/adapters: provider/tool/storage/process/sandbox IO
- src/internal/learning: learning control, user/agent learning and evidence
- scripts: build, quality and release checks
- testdata: fixed source fixtures

Use npm ci and npx tsc -p tsconfig.json --noEmit for source setup/checking.
npm run build and npm run verify also require pinned native/sandbox build inputs;
see provenance and ../docs/release/CURRENT_SOURCE_CHECKPOINT.md. Raw historical
acceptance evidence is not part of this public snapshot.

See AGENTS.md, docs/00-总领 and ../docs/architecture/README.md for engineering boundaries.
