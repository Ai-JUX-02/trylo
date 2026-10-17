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

## 公开源码构建前置条件

Windows x64 / Node >=22：先从仓库根目录运行 `node scripts/setup-cli-native.mjs --install`，再在本目录 `npm ci` 和 `npm run build`。PTY 固定制品随库提供，沙箱 helper 按固定版本和摘要显式获取；构建本身不会自动下载。详见[源码构建说明](../docs/development/build-from-source.md)。其他平台 PTY 和完整 Desktop 安装包不在本轮验收范围。
