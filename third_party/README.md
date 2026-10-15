# 第三方组件边界

> 2026-10-15 source audit: the Windows-MCP fork, tool registry, Tauri icons and sandbox source inputs are now included. See [source completeness](../docs/release/SOURCE_COMPLETENESS_2026_10_15.md). Historical migration plans and release limitations below remain distinct.
本目录用于后续整理经过审计的固定来源、许可证、NOTICE、Trylo 补丁及重建说明。当前不自动搬入本机 vendor 完整树。

| 既有组件 | 当前事实 | 公开前需要闭合 |
| --- | --- | --- |
| sandbox-runtime | CLI adapter 内有来源、许可证和修改记录，静态 JS 与所需类型声明已纳入源码；预编译 helper 不在本次提交中 | 精确静态闭包、获取/校验步骤、许可证随制品传递 |
| Windows-MCP fork | Desktop Services 的工具组装读取本地 new_tool 源码 | 上游固定版本、Trylo 修改、完整 Python 依赖与 native helper 接线 |
| CoWork vendor | workd 构建仍读取被忽略的完整上游树 | 明确当前复用边界、固定组装与来源，不整库伪装为自产代码 |
| Hermes capabilities | Desktop sidecar 中有既有能力代码和服务接线 | 明确许可/来源、Python 环境、与 CLI 学习控制面的边界 |
| npm/Rust/.NET 依赖 | 各包已有锁文件或原生工程 | 覆盖真实制品的闭包、SBOM、LICENSE/NOTICE 与平台下载物 |

旧 Claude Code 官方发行件不进入本目录；“保留第三方归属”不意味着允许分发该发行件。
