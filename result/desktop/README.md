# Trylo Desktop 1.0.1

Windows x64 桌面便携预览版，默认使用旧 Trylo CLI（`legacy-stream-json`）。这是 Desktop 编译产物，与 Android 手机 APP 独立发布。

[下载 Windows 桌面版 ZIP](https://github.com/ylz92871-dotcom/trylo/releases/download/desktop-v1.0.1/Trylo-Desktop-1.0.1-windows-x64-portable.zip) · [发布页](https://github.com/ylz92871-dotcom/trylo/releases/tag/desktop-v1.0.1)

下载后完整解压到一个文件夹，运行 `trylo-desktop.exe`。首次启动请打开项目、选择本机工作目录，并在设置中配置模型连接。需要可用的 Microsoft WebView2 Runtime。

ZIP 自带 Node、旧 CLI、新版 CLI 的可选入口、服务宿主和桌宠运行文件。手动配置的 CLI 路径仍然保留。工具首次启用时可能需要联网准备自身环境。

下载文件放在 GitHub Release；本目录保留下载入口、`release.json`、`SHA256SUMS` 和随附运行时许可证。大文件不写入源码 Git 历史。

这是未签名预览包。旧 CLI 本地模拟模型对话和核心回归已通过。**托管 Work 冷启动探测仍未通过**，与普通旧 CLI 对话分开记录。干净 Windows 上的原生界面、全部工具和真实模型任务尚未完成验收，详情见 [发布记录](../../docs/release/DESKTOP_1_0_1.md)。

本次交付便携 ZIP。NSIS 安装器因大量文件的封装开销中止，没有发布未完成的安装程序。
