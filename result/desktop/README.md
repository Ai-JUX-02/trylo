# Trylo Desktop 1.0.1 Core（R3）

[下载 Windows 桌面主包（约 220 MB）](https://github.com/ylz92871-dotcom/trylo/releases/download/desktop-v1.0.1-r3/Trylo-Desktop-1.0.1-windows-x64-portable-core.zip) · [发布页](https://github.com/ylz92871-dotcom/trylo/releases/tag/desktop-v1.0.1-r3)

这是 Windows x64 Desktop 便携预览版，与 Android 手机 APP 分开发行。主包从 R2 的约 367 MB 降到约 220 MB；最初版本约 593 MB。

**普通 Work 保留，继续通过 Trylo CLI 执行。主包不包含 CoWork 后台任务运行时，也不依赖它启动。** Code、Work 对话、附件、工具配置、产物预览、Node 和桌宠均保留。默认协议仍为旧 CLI 的 `legacy-stream-json`，新版 CLI 可显式选择。

完整解压 ZIP 后运行 `trylo-desktop.exe`，选择本机项目目录并配置模型连接。需要可用的 Microsoft WebView2 Runtime。工具首次启用时可能需要准备自身环境。

[CoWork 独立实验依赖（约 147 MB）](dependencies/README.md) 仅供维护与试验，普通 Work **不需要安装**。该后台尚未通过完整冷启动验证，本版没有自动安装或启用入口。

[发布与验证记录](../../docs/release/DESKTOP_1_0_1_R3.md) · [组件架构边界](../../docs/architecture/OPTIONAL_COWORK_RUNTIME.md)

本目录保留下载索引、`release.json`、`SHA256SUMS`、依赖元数据和许可声明；大文件存放在 GitHub Release，不写入源码 Git 历史。旧版 Release 保留。

两个 ZIP 均已完整解压并核对运行文件。核心依赖检查、CLI 清单和旧 CLI 本地模拟对话通过。完整原生 Desktop 界面、干净 Windows 安装、全部工具与真实模型任务仍未完成验收；原有浏览器合同测试问题也未在本次打包变更中修复。这是未签名预览包。
