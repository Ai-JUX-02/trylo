# Trylo 本轮 Bug 排查与修复报告（Debuglog02）

日期：2026-10-16（Asia/Shanghai）  
项目：`F:\trylo`  
分支：`feat/Debug`  
基线提交：`1502559`（Debug01）  
远程：origin 为 `Ai-JUX-02/trylo`，upstream 为 `ylz92871-dotcom/trylo`。

**本轮发现并修复 11 处可复现缺陷，修改或新增 9 个源代码/测试文件，新增 19 项测试。相关回归 63 项全部通过。服务端全量测试仍有 2 项既有失败，Work 仍有 6 项缺失文件导致的失败，不能视为全项目验收通过。**

代码留在当前工作区，未提交、未推送。用户在本轮开始前移动 Debuglog01 留下的 `Debuglog/` 删除和 `Debuglog01/` 未跟踪状态均已保留，不计入本轮修改文件数。

## 1. 执行计划与完成情况

本轮已将排查任务登记为 goal，并完成 [执行计划](PLAN.md)：

1. 确认分支、工作区和上轮修复，识别测试入口及依赖。
2. 运行服务端和移动端测试基线，重点检查持久化、远程身份、聊天及并发异常。
3. 增加可复现的异常场景，在修复前运行并保存失败证据。
4. 修复已确认问题，验证相关回归、服务端完整入口、移动端本机网关集成及 Work 测试。
5. 检查差异和语法，整理缺陷、修改文件、测试结果和剩余限制。

环境：Windows、Node.js `24.12.0`、npm `11.6.2`。使用服务端和 Work 各自现有锁文件安装依赖；未新增产品依赖、未修改锁文件。隔离终端因 `CreateProcessSecurityEnvironment / 0x80070020` 无法启动，后续通过获准的普通终端执行；最终测试结果不把该启动错误计为产品缺陷。

## 2. 已修复的 Bug

### B01：Windows 上并发发布相同工具配置仍失败

- 位置：`desktop-services/src/tooling/tool-profile-service.mjs`。
- 影响：两个服务实例同时解析配置时，其中一个返回 `config_write_failed`，工具不可用。
- 根因：Debuglog01 已给临时文件增加 UUID，但 Windows 仍可能拒绝将第二份文件重命名覆盖刚发布的目标，返回 `EPERM`。
- 修复：遇到 `EEXIST / EPERM / EACCES` 后读取已发布文件，仅在内容完全相同时复用；不同内容或无法读取仍返回真实失败。保留临时文件清理。
- 证据：现有并发测试在本机修复前失败；新增的同内容 Windows 冲突测试也失败。修复后两者通过，不同内容的拒绝测试仍通过。

### B02：并发初始化远程身份返回不同的配对凭据

- 位置：`desktop-services/src/remote/identity.mjs`。
- 影响：同一服务进程中不同实例可能同时生成身份，调用者拿到的配对凭据与最终磁盘内容不一致，导致手机配对失效。
- 根因：读取、生成、写入没有共同的串行所有者，且所有实例共用包含进程 ID 的临时文件。
- 修复：按身份文件的规范化路径共享串行队列，覆盖创建和旧身份导入；每次写入使用独立 UUID 临时文件。失败后的后续排队操作仍能执行。
- 证据：阻塞首次写入后启动第二个实例，修复前返回两个不同 token；修复后仅生成一次，两个调用与磁盘内容一致。另验证了导入/创建交错和写入失败后的队列恢复。
- 范围：本修复协调同一进程的多个 store 实例，没有增加跨进程文件锁。

### B03：身份读取故障被误判为不存在，覆盖已有配对凭据

- 位置：`desktop-services/src/remote/identity.mjs`。
- 影响：读取返回权限或存储错误时，代码可能重新生成身份，破坏已有配对。
- 根因：`readIdentityFile()` 捕获所有错误并返回 `null`，调用者无法区分缺失、损坏和读取失败。
- 修复：仅缺失文件或 JSON 语法损坏返回空值；其他 I/O 错误向调用者传播。
- 证据：给已有身份注入 `EACCES`，修复前操作意外成功并覆盖文件；修复后正确拒绝，原文件字节保持不变。

### B04：身份恢复的重命名失败会删除原文件

- 位置：`desktop-services/src/remote/identity.mjs`。
- 影响：尝试恢复损坏的身份文件时，第一次重命名失败后先删除原文件；重试仍失败则原始数据消失，并遗留临时文件。
- 修复：保留原子重命名，失败时不删除原目标；在最终清理中删除临时文件并保留原始错误。
- 证据：预置损坏的原文件并持续注入 `EACCES`，修复前原文件变成 `ENOENT`；修复后原字节保留，目录没有临时文件残留。此测试验证的是保留原文件，未把损坏内容声称为有效凭据。

### B05：导入旧身份未验证目标存储目录

- 位置：`desktop-services/src/remote/identity.mjs`。
- 影响：未配置应用数据目录时，导入仍读取旧文件，可能返回误导性的“跳过”，而没有报告目标配置缺失。
- 修复：创建与导入共用前置校验，在任何身份文件 I/O 前拒绝缺失的目标目录。
- 证据：修复前没有产生应有的配置错误；修复后返回 `app data dir is not configured`，文件读取调用数为 0。

### B06：聊天历史部分写入失败会丢失上一份完整记录

- 位置：`desktop-services/src/pet-chat/chat-store.mjs`。
- 影响：磁盘空间不足等错误发生在写入中途时，正式历史已被截断，后续读取降级为空记录。
- 根因：直接写入 `desktop-chat.json`，没有原子发布。
- 修复：使用独立临时文件写入后重命名；同一 store 的写入按调用顺序串行执行。失败清理临时文件，后续写入仍可恢复。
- 证据：写入 12 个字符后注入 `ENOSPC`，修复前原历史变为空；修复后原记录保留、临时文件清除，随后再次写入成功。

### B07：聊天存储故障使会话永久卡在“正在回复”

- 位置：`desktop-services/src/pet-chat/chat-command.mjs`。
- 影响：保存用户消息失败后，调用直接拒绝，没有 `chat_error`，后续请求被一直判定为已有回复在运行。
- 根因：首次读取/写入历史在 `try/finally` 外，而回复控制器已占用。
- 修复：将初始化历史放入统一错误和清理路径，发送真实 `chat_error`，释放控制器。
- 证据：首次保存故障后，修复前抛出未处理的调用失败；修复后产生存储错误事件，下一次请求能够正常开始，并进入其配置校验。

### B08：清空聊天时，迟到的历史读取会恢复已清除消息

- 位置：`desktop-services/src/pet-chat/chat-command.mjs`。
- 影响：用户在历史尚未读取完成时清空聊天，旧请求仍拼接并写回旧记录和用户消息。
- 修复：在读取历史、持久化及模型返回等异步边界检查该请求的取消信号，取消后不继续启动或完成旧回复。
- 证据：挂起读取，执行清空，再返回旧历史；修复前历史重新出现，修复后历史保持为空，旧请求不发送 `chat_started`。

### B09：流式前缀跨网络分块时误判为 JSON

- 位置：`desktop-services/src/pet-chat/llm-http.mjs`。
- 影响：接口没有明确 SSE 响应头且首块只有 `d` 等不完整前缀时，正常流式回复触发 JSON 解析失败。
- 根因：只凭第一块文本决定 SSE/JSON，没有等待完整前缀。
- 修复：累积前缀，识别完整 SSE 字段后再确定格式，保留 JSON 回退，并在结束时排空 UTF-8 解码器。
- 证据：`d / a / ta: ...` 分块修复前报 `Unexpected token 'd'`；修复后收到完整中文内容。另覆盖逐字节 UTF-8、CRLF、注释、末尾未终止帧及分块 JSON 回退。

### B10：收到响应头后的取消和超时错误未统一处理

- 位置：`desktop-services/src/pet-chat/llm-http.mjs`。
- 影响：用户在响应体读取期间停止回复，原生 `AbortError` 未被识别，界面无法使用已有的“已停止本次回复。”路径；响应体超时也未获得已有的超时错误码。
- 根因：只在 `fetch()` 等待响应头时转换错误，遗漏 JSON/SSE 的响应体读取；取消检测缺少原生异常名称。
- 修复：识别原生 `AbortError`，对响应体读取错误复用既有错误转换。
- 证据：真实本机 HTTP 服务先发响应头并挂起响应体，JSON/SSE 两种路径修复前都无法识别取消，修复后均通过。补充超时响应体测试确认返回 `ETIMEDOUT / Request timed out`。

### B11：流式事件处理失败后未取消和释放响应流

- 位置：`desktop-services/src/pet-chat/llm-http.mjs`。
- 影响：模型错误或回调异常已终止当前回复，底层响应仍可能保持读取占用，浪费连接和传输资源。
- 根因：读取器没有统一的异常清理路径。
- 修复：退出时对未读完的流执行取消并释放读取锁；清理失败不覆盖原始错误。
- 证据：让 payload 回调抛错，修复前流没有被取消；修复后底层 `cancel()` 被调用、读取锁释放，原始 `payload failed` 错误保留。

## 3. 修改文件清单

路径相对于 `F:\trylo`。以下共 9 个源代码/测试文件；报告、计划和证据文件另计。

| 文件 | 类型 | 修改目的 |
| --- | --- | --- |
| `desktop-services/src/tooling/tool-profile-service.mjs` | 修改 | B01：Windows 并发发布时校验并复用相同文件 |
| `desktop-services/src/remote/identity.mjs` | 修改 | B02–B05：共享身份事务、I/O 失败传播、原文件保护、导入目标校验 |
| `desktop-services/src/pet-chat/chat-store.mjs` | 修改 | B06：聊天历史串行原子写入及失败恢复 |
| `desktop-services/src/pet-chat/chat-command.mjs` | 修改 | B07、B08：存储异常释放控制器、取消后阻止迟到工作 |
| `desktop-services/src/pet-chat/llm-http.mjs` | 修改 | B09–B11：分块识别、响应体错误处理、流清理 |
| `desktop-services/tests/services/tool-profile-concurrency.test.mjs` | 修改 | 新增 2 项 Windows 同内容/异内容冲突测试 |
| `desktop-services/tests/services/remote-identity-recovery.test.mjs` | 新增 | 6 项身份并发、故障、导入和恢复测试 |
| `desktop-services/tests/pet-chat-recovery.test.mjs` | 新增 | 3 项持久化、会话恢复、清空竞态测试 |
| `desktop-services/tests/pet-chat-http.test.mjs` | 新增 | 8 项流解析、取消、超时、资源清理测试 |

本轮记录位于 `Debuglog02/`：本报告、`PLAN.md` 和下述 evidence 目录。

## 4. 验证结果

| 检查 | 结果 |
| --- | --- |
| 修复相关回归，包含既有聊天合同和远程网关测试 | 63 通过，0 失败 |
| 服务端修复前完整测试基线 | 467 项：459 通过、3 失败、5 跳过 |
| 服务端最终官方 `npm test` | 486 项：479 通过、2 失败、5 跳过 |
| 移动端远程连接与真实本机网关集成 | 11 通过，0 失败 |
| Work 官方 `npm test` | 353 项：347 通过、6 失败 |
| 9 个源代码/测试文件的 JavaScript 语法检查 | 通过 |
| Git 空白字符检查 | 通过 |
| 官方服务端入口中的仓库外路径扫描 | 通过 |

相关回归是服务端全量测试的子集，不能把两者相加作为独立测试数。最终服务端相对基线新增 19 项测试，并关闭了原有的 Windows 并发发布失败。

证据目录：[Trylo-Bugfix-2026-10-16-feat-Debug-evidence](Trylo-Bugfix-2026-10-16-feat-Debug-evidence/summary.json)。主要文件：

- `regressions-red.txt`：首次 10 项异常测试在未修复代码上的失败。
- `profile-red.txt`：Windows 发布竞争修复前 2 失败、1 对照通过。
- `chat-clear-red.txt`：清空竞态修复前失败；此时前面的存储修复已完成。
- `regressions-green.txt`：最终相关 63 项通过。
- `services-baseline.txt`、`services-final.txt`：服务端完整基线和最终输出。
- `mobile-final.txt`、`work-final.txt`：移动端和 Work 输出。
- `static-checks.txt`、`summary.json`：静态检查及结构化汇总。

## 5. 尚未关闭的失败与限制

服务端还剩 2 项既有失败：

1. `tooling-pr6.test.mjs` 要求的 `windows_mcp` vendor 源码未包含在当前快照中。
2. `tooling-pr7.test.mjs` 的 Chrome DevTools 参数精确断言只接受原有两项参数；当前浏览器 observer 还注入 headless、viewport 和本机 CDP 参数。该合同差异本轮保持可见，未通过删除参数或放宽断言消除。

Work 的 6 项失败与 Debuglog01 中记录的缺失资源一致：1 项缺少 CoWork vendor 的 `executor-completion-utils.ts`；5 项缺少真实录制历史的 `work-recordings/index.json`。没有补造录制历史。

本轮未运行 Desktop React/Tauri 全量测试、新 CLI 测试、原生桌面界面、Android 真机或真实模型端点验收。HTTP 测试使用受控流和真实本机 HTTP 服务。未修改 UI，不宣称完成浏览器或原生界面验收。服务端官方脚本因为剩余两项失败，未执行末尾的桌宠打包 smoke test。

身份串行化只协调同进程 store；跨进程共享同一应用目录的锁机制未纳入本轮。文件发布使用同目录重命名，未增加掉电持久化的 `fsync` 保证。Windows 文件锁错误通过可重复故障注入验证，本轮没有进行外部程序持锁的长期压力测试。

## 6. 关键复验命令

服务端目录 `F:\trylo\desktop-services`：

```powershell
npm.cmd test
node --test --test-concurrency=1 tests/services/remote-identity.test.mjs tests/services/remote-identity-recovery.test.mjs tests/services/remote-gateway-adapter.test.mjs tests/services/remote-gateway-events.test.mjs tests/services/tool-profile-concurrency.test.mjs tests/pet-chat.test.mjs tests/pet-chat-recovery.test.mjs tests/pet-chat-http.test.mjs
```

移动端目录 `F:\trylo\mobile-app`：

```powershell
node --test tests/remote-connection.test.mjs tests/remote-gateway-integration.test.mjs
```

Work 目录 `F:\trylo\work`：`npm.cmd test`。根目录空白字符检查：`git diff --check`。各模块依赖缺失时使用其现有锁文件安装；需要允许测试创建子进程及监听本机端口。

## 7. 自审与回滚

- 可读性与维护性：修复位于原有状态所有者中；身份队列、原子写入和流清理均有局部说明及行为测试。
- 架构与兼容：没有新增协议事件、修改持久化字段或扩大执行权限。身份读取 I/O 错误从“视为不存在”改为拒绝，是防止凭据被错误轮换的有意收紧。
- 并发与恢复：检查了同进程多实例、导入/创建交错、失败队列恢复、取消后的迟到工作及临时文件清理。
- 供应链：只安装既有锁定依赖；未引入新依赖、复制第三方源码或获取缺失的 vendor/原生资源。
- 风险：不可替换的文件锁仍会使写入失败，但失败不应主动删除原目标；UI 和跨进程行为仍受上述验证范围限制。
- 回滚：只审查并还原第 3 节列出的 9 个文件即可撤销本轮产品和测试改动；新增文件可逐个移除。先确认没有叠加用户新改动，不使用全仓重置，也不还原用户对 Debuglog01 的移动。

本轮关闭上述 11 处有复现证据的缺陷，剩余失败及未执行范围保留在记录中，不据此宣称全项目已无 Bug 或可发布。
