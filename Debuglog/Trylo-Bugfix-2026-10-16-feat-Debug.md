# Trylo 本轮 Bug 排查与修复报告

日期：2026-10-16（Asia/Shanghai）  
项目：`/Users/mo/Documents/trylo`  
分支：`feat/Debug`  
基线提交：`c516564`（本轮开始时工作区干净）  
远程：origin 为 `Ai-JUX-02/trylo`，upstream 为 `ylz92871-dotcom/trylo`。

**本轮修复 9 处可复现 Bug（缺陷），修改或新增 12 个文件。本轮相关的 69 项测试通过；全仓测试仍有失败，不能视为全项目验收通过。** 修改保留在当前分支的工作区，尚未提交。

## 1. 执行计划与完成情况

本轮将以下计划登记为 goal（目标），实际按计划完成排查、修复和记录：

1. 确认项目、分支、工作区与测试入口，建立 test baseline（测试基线）。
2. 检查持久化、工具配置、进程健康检查、远程连接及跨平台路径，复现问题。
3. 先保留 red evidence（失败证据），再修复并运行 regression tests（回归测试）。
4. 扩大测试、检查最终差异，记录修改文件、剩余失败及验证限制。

测试环境为 macOS arm64、Node.js 22.22.2、npm 10.9.7。Desktop 使用现有 pnpm 锁文件安装，CLI、服务端及移动端使用各自现有 npm 锁文件安装。没有新增产品依赖或修改锁文件。

## 2. 已修复的 Bug

### B01：一次写入失败导致后续已排队写入全部失败

- 位置：`desktop-services/src/learning/file-memento.mjs`。
- 影响：学习状态持久化发生一次读取或写入故障后，同一时刻已入队的更新会连带失败。
- root cause（根因）：队列直接链接可能 reject（拒绝）的 Promise；在调用者捕获后重置队列，无法挽救已链接到失败 Promise 的后续操作。
- 修复：分离“当前操作结果”和“串行队列尾部”。当前调用仍收到真实错误，队列尾部恢复为 fulfilled（已兑现），后续更新按顺序执行。
- 失败证据：注入一次 `EIO` 后，原代码三次更新均为 `rejected`；修复后为 `rejected / fulfilled / fulfilled`，随后第四次更新也成功，磁盘保存后面三项数据。

### B02：原子替换失败时删除了上一份有效状态

- 位置：`desktop-services/src/learning/file-memento.mjs`。
- 影响：重命名临时文件失败时，原代码会先删除已提交状态，再尝试重命名；第二次仍失败就丢失旧数据。
- 修复：保留 atomic replacement（原子替换），失败时只清理临时文件，并将真实错误返回调用者；不再删除已提交文件。
- 失败证据：注入持续 `EACCES`，原代码读取旧键得到 `undefined`；修复后旧值 `keep me` 保留，新值未提交，临时文件被清理。
- 限制：没有执行 Windows 真机文件锁验证；遇到不可替换的文件锁时，调用者会收到失败，旧状态得以保留。

### B03：并发生成工具配置时争用同一个临时文件

- 位置：`desktop-services/src/tooling/tool-profile-service.mjs`。
- 影响：两个会话或服务实例同时解析相同 profile（工具配置）时，可能出现 `config_write_failed`，导致工具配置生成失败。
- root cause（根因）：临时文件名仅包含目标路径和进程 ID，同进程并发写入会使用同一文件；其中一次 rename（重命名）后，另一次找不到临时文件。
- 修复：每次写入使用独立 UUID 临时文件，发布后清理；最终 content-addressed path（按内容寻址的路径）和哈希保持原有语义。
- 失败证据：用同步屏障强制两个实例写完后同时发布，原代码一项返回 `ENOENT`；修复后两项均成功，返回相同完整配置，目录没有临时文件残留。

### B04：健康检查把退出失败或超量输出的进程判为成功

- 位置：`desktop-services/src/tooling/tool-health-service.mjs`。
- 影响：损坏的工具只要打印版本号，即使退出码非零，仍可能被判定为可用；输出超过上限时也会提前被当成成功。
- 修复：正常成功必须满足 exit code（退出码）为 0；输出超限返回探测失败，保留已有的有界重试。
- 失败证据：输出 `Version 1.2.3` 后退出 1，原代码返回版本字符串；修复后返回 `null`。输出超过 4096 字符的失败进程同样不再获准。正常退出的对照测试仍返回版本号。

### B05：移动端旧健康快照覆盖了更新的流式聊天事件

- 位置：`mobile-app/src/remoteConnection.ts`。
- 影响：REST 健康检查尚未返回时，WebSocket 已收到聊天增量；旧快照随后返回，会覆盖刚显示的内容。
- root cause（根因）：revision（版本计数）只在收到完整快照时推进，流式 `action_event` 没有推进版本。
- 修复：处理有效的 chat/fun 动作事件时推进版本，使已发出的旧健康快照被识别为过期。
- 失败证据：先发起健康检查，再接收聊天增量，最后返回旧快照；原代码接收 `initial, old` 两份快照，修复后只保留 `initial`，流式事件仍交付一次。

### B06：Skills 未配置存储时误报 Python 缺失

- 位置：`desktop-services/src/learning/skills-client.mjs`。
- 影响：没有配置存储目录时，客户端仍探测 Python；如果 Python 同时缺失，会掩盖最直接的配置错误。
- 修复：先验证存储配置，再执行解释器定位。
- 失败证据：使用会抛错的 resolver（解析器），原代码错误地返回 Python 错误；修复后返回 `storage root is not configured`，解析器调用次数为 0，也不启动子进程。

### B07：Skills 适配器退出失败却通过 JSON 声称成功

- 位置：`desktop-services/src/learning/skills-client.mjs`。
- 影响：适配器打印 `{"success":true,"skills":[]}` 后退出 1，客户端仍返回 `ok:true`。
- 修复：成功结果同时要求 JSON 成功标记与退出码 0；JSON 已提供的真实失败信息继续保留。
- 失败证据：同一非零退出场景，原代码误报成功；修复后返回 `ok:false` 和 `exited 1`，已有正常结果及业务失败测试保持通过。

### B08：npm 定位器仅支持 Windows 安装布局

- 位置：`desktop-services/src/tooling/tool-package-manager.mjs`。
- 影响：macOS/Linux 的 Node 安装虽然包含 npm，工具源码构建仍报 `npm CLI not found next to the Node runtime`。
- root cause（根因）：只查找与 `node.exe` 相邻的 `node_modules/npm`，没有识别 Unix 的 `<prefix>/bin/node` 与 `<prefix>/lib/node_modules/npm` 布局。
- 修复：兼容两种安装布局，仍使用当前 Node 运行 npm 的 JavaScript 入口；增加可注入路径以进行独立测试。
- 证据：新增 Windows/Unix 布局和 npm 缺失测试共 3 项通过；Unix 修复前返回 `null`。复验中原来因 npm 定位失败的源码构建测试不再以该错误失败。

### B09：Unix 本地制品镜像被当成网络地址

- 位置：`desktop-services/src/tooling/tool-package-manager.mjs`。
- 影响：macOS/Linux 的 `/.../mirror` 目录不走本地复制，离线镜像失效，并出现不必要的下载尝试。
- root cause（根因）：本地镜像判定仅覆盖 Windows 盘符、UNC 和 `file://`。
- 修复：增加 `path.isAbsolute` 判定，支持 Unix 绝对路径；继续执行原有 SHA-256 校验与上游回退规则。
- 失败证据：已有“默认本地镜像命中”“显式本地镜像命中”“本地镜像缺失回退”三项测试修复前失败；修复后整个镜像测试组 8 项通过。命中时网络调用为 0，缺失时仅请求上游地址。

## 3. 修改文件清单

所有路径相对于 `/Users/mo/Documents/trylo`。

| 文件 | 类型 | 修改目的 |
| --- | --- | --- |
| `desktop-services/src/learning/file-memento.mjs` | 修改 | B01、B02：队列恢复、旧状态保护及临时文件清理 |
| `desktop-services/src/learning/skills-client.mjs` | 修改 | B06、B07：前置配置校验、退出失败处理 |
| `desktop-services/src/tooling/tool-health-service.mjs` | 修改 | B04：退出码与输出上限 |
| `desktop-services/src/tooling/tool-package-manager.mjs` | 修改 | B08、B09：Unix npm 布局、本地镜像路径 |
| `desktop-services/src/tooling/tool-profile-service.mjs` | 修改 | B03：并发独立临时文件 |
| `mobile-app/src/remoteConnection.ts` | 修改 | B05：流式事件推进版本 |
| `desktop-services/tests/services/file-memento.test.mjs` | 修改 | 写入失败连带影响、旧状态丢失回归 |
| `desktop-services/tests/services/skills-client.test.mjs` | 修改 | 确定性配置错误测试、非零退出回归 |
| `desktop-services/tests/services/npm-command.test.mjs` | 新增 | Windows/Unix npm 布局与缺失场景 |
| `desktop-services/tests/services/tool-health-probe-exit.test.mjs` | 新增 | 真实子进程的成功、失败及超量输出 |
| `desktop-services/tests/services/tool-profile-concurrency.test.mjs` | 新增 | 两个实例同时生成配置的竞争条件 |
| `mobile-app/tests/remote-connection.test.mjs` | 修改 | 流式事件与旧健康快照交错场景 |

## 4. 验证结果

### 本轮相关测试：69 项通过

| 检查 | 结果 |
| --- | --- |
| Memento、Skills、npm 定位、并发配置及版本探测 | 29 通过，0 失败 |
| 制品镜像测试组 | 8 通过，0 失败 |
| 移动端连接与真实本机网关集成测试 | 11 通过，0 失败 |
| 移动端现有 UI/客户端合同测试 | 21 通过，0 失败 |
| Desktop TypeScript 检查 | 通过 |
| 移动端 TypeScript 检查 | 通过 |
| 新 CLI TypeScript 检查 | 通过 |
| 修改的服务端文件语法检查、Git whitespace（空白字符）检查 | 通过 |
| 服务端仓库外路径扫描 | 通过 |

### 扩展测试：未达到全绿

| 模块与测试方式 | 实际结果 |
| --- | --- |
| Desktop 全量 Vitest，在允许本机监听的环境运行 | 2647 项：2626 通过、21 失败 |
| desktop-services 完整 Node 测试 | 457 项：448 通过、5 失败、4 跳过 |
| 新 CLI 已编译 hermetic（隔离）测试，542 个测试文件 | 4095 项：4034 通过、45 失败、3 取消、13 跳过 |
| Work 现有测试 | 353 项：347 通过、6 失败 |
| 新 CLI 标准 `npm test` | 构建阶段缺少 `vendor-bin/srt-win-x64.exe`，测试入口未完整执行 |
| 工具桥验证 | 缺少根目录 `tool-sources.json`，未通过 |

说明：CLI 补充测试直接运行 TypeScript 编译输出，并设置 20 秒测试超时以避免平台进程测试长期挂起。它是诊断证据，不代替标准构建或完整质量门禁。服务端完整脚本因 Node 测试仍失败，未继续执行末尾的桌宠打包 smoke test（冒烟测试）。

最初沙箱禁止监听本机端口造成 `EPERM` 和超时；需要本机端口的最终测试已经在允许监听的环境复验。表中最终计数不将这些最初的环境失败重复计算为产品 Bug。

## 5. 尚未关闭的失败与限制

### desktop-services：5 项失败

1. 桌宠的两项 macOS 状态测试期望 `unsupported_platform`，实际返回 `not_attempted`。这是剩余状态报告问题，本轮没有改动 vendor 桌宠桥。
2. CAD wheel 安装测试使用 Windows 形状的可执行文件 fixture（测试样例），在本机仍不能证明返回路径指向实际文件；需要补齐跨平台安装合同。
3. 源码快照没有测试所要求的 `windows_mcp` vendor fork（随附分支源码）。
4. Chrome DevTools profile 的旧 argv（命令行参数）断言与当前浏览器 observer（观察器）注入的参数不一致，需要单独确认合同。

### Desktop：21 项失败

- 已在源码快照说明中记录的 5 项 CLI 浏览器 profile 集成失败仍存在。
- 原生浏览器启动测试未观察到预期 MCP 工具。
- workspace key（工作区键）的大小写、文件路径项目名，共 3 项断言与当前实现/样例不一致。没有为了消除失败而更改现有语义。
- 顶栏样式 5 项、ModeChip 可访问角色 1 项失败，尚需结合真实界面确认。
- team/profile 合同的 6 项失败依赖本快照未包含的旧 `trylo cli` 源码。

### 新 CLI 与 Work

- CLI 失败覆盖凭据文件权限与损坏分类、Windows 路径及 shell 假设、文件导航、计划任务的闰年/DST（夏令时）边界、隔离目录等；另有平台进程/子代理测试取消或超时。它们尚未逐项确认根因，不宣称全部只是平台限制。
- Work 的 6 项失败分别依赖缺失的 CoWork vendor 文件（1 项）及被源码导出排除的真实录制历史（5 项）。
- Windows 原生桌面、WebView2、完整安装包、Android 真机和真实模型服务验收均未完成。

完整失败名称见同目录的 [结构化证据](Trylo-Bugfix-2026-10-16-feat-Debug-evidence/summary.json)；这些失败仍保持可见，没有通过删测试、放宽断言或补造历史数据消除。

## 6. 关键复验命令

以下命令在各自模块目录执行；日志也保存在报告旁的 evidence（证据）目录。

服务端本轮回归：

```sh
node --test tests/services/file-memento.test.mjs tests/services/skills-client.test.mjs tests/services/npm-command.test.mjs tests/services/tool-profile-concurrency.test.mjs tests/services/tool-health-probe-exit.test.mjs
node --test --test-name-pattern='TRYLO_ARTIFACT_MIRROR' tests/services/tool-package-manager-cad.test.mjs
```

服务端全量测试：本机使用 `UV_PATH=/opt/homebrew/bin/uv npm test`。其他机器应使用其真实 uv 路径，并允许测试监听本机端口。

移动端：

```sh
node --experimental-strip-types --test tests/remote-connection.test.mjs tests/remote-gateway-integration.test.mjs
node ../desktop/node_modules/vitest/vitest.mjs run --config tests/vitest.config.mts
node node_modules/typescript/bin/tsc --noEmit
```

Desktop：

```sh
pnpm typecheck
pnpm exec vitest run --maxWorkers=4 --minWorkers=1
```

CLI：`node node_modules/typescript/bin/tsc -p tsconfig.json --noEmit`；标准入口仍为 `npm test`，需要先按项目来源台账补齐真实辅助文件。

Work：`node --experimental-strip-types --import ./tests/register-hook.mjs --test tests/*.test.ts`。

## 7. 自审与回滚

- readability / maintainability（可读性与可维护性）：修改集中在原有所有者内；队列尾部、原子提交、配置发布及退出失败均有明确行为与测试。
- architecture boundary（架构边界）：没有改动 CLI 协议、学习执行边界、权限服务或审批语义；没有改变持久化格式和配置哈希算法。
- compatibility（兼容性）：npm 定位新增的可选参数用于测试，既有无参数调用保留；损坏或失败进程现在会被正确拒绝，属于有意收紧成功条件。
- supply chain（供应链）：仅安装现有锁定依赖，没有引入新依赖，没有下载或伪造缺失的原生辅助文件。完整发行物的许可证/SBOM 验收不在本轮完成范围。
- 风险：状态替换在临时文件锁存在时可能失败，但旧状态得以保留；Windows 并发发布和原生运行仍需真机验收。
- rollback（回滚）：逐项审查并还原上述 12 个文件即可撤销本轮代码修改。回滚前先确认没有叠加用户的新改动，不应使用全仓重置。报告和证据保存在项目外，不影响源代码回滚。

本轮完成的是上述 9 处有复现证据的修复及对应验证；剩余全仓失败仍是后续工作，不能据本报告宣称项目已无 Bug 或可发布。
