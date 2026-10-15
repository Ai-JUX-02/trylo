# 可选实验依赖：CoWork 后台任务运行时

[下载 CoWork 0.5.51 Windows x64 实验包（约 147 MB）](https://github.com/ylz92871-dotcom/trylo/releases/download/desktop-v1.0.1-r3/Trylo-CoWork-Runtime-0.5.51-windows-x64-experimental.zip)

**普通 Work 不需要这个包。** 普通 Work 已通过 Trylo CLI 执行；这个包仅保留独立后台任务后端，供维护与试验。

当前状态：原生模块与文档读写探测通过，完整 Control Plane 冷启动和后台任务验收尚未通过。它不是安装后即可使用的功能包。本版没有应用内安装器或启用开关，下载或解压不会自动启用后台任务。

包内包含 `workd/`、兼容启动器 `work/bin/`、`dependency-manifest.json` 和原始许可声明。不重复携带 Node，实验运行需使用主包的 Node v24.14.1。详细兼容性、校验值和已知限制见 [依赖元数据](cowork-runtime.json) 与 [说明文件](../README-CoWork.txt)。

后续先修复和验证后台运行，再决定是否恢复产品入口、增加按需安装。当前桌面主包可以独立下载和使用。
