# Current source checkpoint / 当前源码快照

> Current source decision (2026-10-15): main working-tree fixes are synchronized, trylo-v1 is the default, and legacy CLI source/engine staging are excluded. [Synchronization record](MAIN_SOURCE_SYNC_2026_10_15.md). Earlier R3 artifact notes describe their historical download, not this source default.
> 2026-10-15 source audit: the Windows-MCP fork, tool registry, Tauri icons and sandbox source inputs are now included. See [source completeness](SOURCE_COMPLETENESS_2026_10_15.md). Historical migration plans and release limitations below remain distinct.
Date / 日期：2026-10-15
Status / 状态：源码开发快照；目录迁移和发行验收未完成。

This checkpoint adds the current new Trylo CLI and refreshes the public product source. It keeps the existing source directory names so that the proposed reorganization does not introduce an additional path break. The target tree in the architecture document remains a migration plan.

本次更新产品源码、新版 CLI 和整理后的架构说明。保留现有目录名，避免把未接线的预览目录当作产品入口。旧 CLI 和官方 runtime 发行件未纳入；旧协议适配器仍存在，不能宣称整个桌面产品已完成迁移。

## Included / 已纳入
- Product source, existing lockfiles, website source, and selected architecture/engineering policies.
- Existing Trylo PTY/WGC helper source in its current build locations.
- The sandbox adapter's five static JavaScript modules, upstream LICENSE and provenance.
- Synthetic source fixtures; raw session traffic, recordings and private development history are excluded.

## Open work / 未关闭事项

The source default and future packaging now use the new CLI; see
[the current synchronization record](MAIN_SOURCE_SYNC_2026_10_15.md) for
headless regression results and retained first-run failures.

1. Complete clean-clone native packaging and installed Desktop acceptance.
2. Complete WebView2/native-window, device and real-provider acceptance.
3. Migrate remaining history-dependent acceptance scripts to distributable fixtures.
4. Resolve the existing services tooling-pr7 browser argv expectation.
5. Update the final artifact-level dependency/license inventory when producing a new binary.

## Verification / 验证
The exact verification result for the frozen source is recorded in SOURCE_CHECKPOINT_VALIDATION.md. No production-ready or all-platform acceptance claim is made.
