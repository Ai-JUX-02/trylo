# Current source checkpoint / 当前源码快照

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
1. Switch Desktop and service shadow calls to the new runtime with actual behavior acceptance.
2. Complete pinned sandbox/helper acquisition and Work vendor/build closure.
3. Migrate history-dependent acceptance scripts to distributable synthetic fixtures.
4. Close the five previously observed Desktop browser-profile contract failures; no full Desktop retest is claimed for this checkpoint.
5. Complete clean-clone release packaging, installed Desktop and required device acceptance.
6. Update the final artifact-level dependency/license inventory before distributing binaries.

## Verification / 验证
The exact verification result for the frozen source is recorded in SOURCE_CHECKPOINT_VALIDATION.md. No production-ready or all-platform acceptance claim is made.
