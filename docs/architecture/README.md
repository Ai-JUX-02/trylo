# Trylo 产品源码架构

> 2026-10-17：同步浏览器固定视口、用户学习文档阅读、turn 全程计时、文件改动事实与 CLI 流/文件工具修复。源码所有权、v1 增量字段和本轮验证见[同步交接](<../../new trylo cli/docs/02-分期工程产出/P08-Desktop切换与Parity/2026-10-17-源码同步交接.md>)；目录迁移仍按下述目标单独推进。

> 2026-10-16：当前源码默认 trylo-v1。新增[逐请求上下文、工具历史与预算边界](context-and-budgets.md)，说明请求所有权、并行结果保护、思考续接和验证范围。发行状态见[当前源码快照](../release/CURRENT_SOURCE_CHECKPOINT.md)。

> Current source decision (2026-10-15): main working-tree fixes are synchronized, trylo-v1 is the default, and legacy CLI source/engine staging are excluded. [Synchronization record](../release/MAIN_SOURCE_SYNC_2026_10_15.md). Earlier R3 artifact notes describe their historical download, not this source default.
> 2026-10-15 source audit: the Windows-MCP fork, tool registry, Tauri icons and sandbox source inputs are now included. See [source completeness](../release/SOURCE_COMPLETENESS_2026_10_15.md). Historical migration plans and release limitations below remain distinct.
> R3 发布边界：普通 Work 使用 CLI；CoWork 后台已从默认主包移出，仅保留独立实验依赖。[当前组件边界](OPTIONAL_COWORK_RUNTIME.md)。以下保留原架构方案记录。

> 状态：待审
> 阶段：公开源码整理，第一批
> 负责人：Trylo 项目维护者
> 最后更新：2026-10-15
> 依赖决策：公开当前产品源码、新版 CLI、整理后的架构文档；先在独立副本整理；当前已授权提交源码开发快照，目录迁移仍未完成。

## 1. 当前事实和本次目标

Trylo 的产品入口包括原生桌面、CLI/TUI、移动端与网站。公开的 Agent 执行内核来自当前 `new trylo cli/`，目标目录名为 `trylo-cli/`。旧 `trylo cli/` 和包含官方发行件的 `runtime/` 不进入公开源码树。

参考 Codex 的职责分离：核心、协议、终端入口、进程服务、执行隔离、持久化与发行脚本各自有边界。参考的是依赖方向和职责，不把 Rust workspace 的每个 crate 对应成一个新的 npm 包。本批保留一个 CLI TypeScript 包，避免一次迁移同时改变目录、模块体系和运行协议。

当前 Desktop 默认使用 trylo-v1，并保留显式旧协议兼容；shadow runner 等后台调用仍需单独验收。因此“预览树中没有旧 CLI 文件”和“产品不再依赖旧 CLI”是两项不同的验收，后者尚未通过。当前没有统一 app-server；本次不把规划中的服务冒充现有能力。

参考：
- [Codex workspace](https://github.com/openai/codex/blob/main/codex-rs/Cargo.toml)
- [Codex 发行入口](https://github.com/openai/codex/blob/main/codex-cli/package.json)

## 2. 首批公开源码树

```text
trylo/
├─ trylo-cli/                 新版 CLI，保留完整的 TS 工程
├─ desktop/                   React + Tauri 原生桌面
├─ desktop-services/          NDJSON 服务宿主及外围服务
├─ mobile-app/                移动端与远程工作台
├─ work/                      Work 工作流、交付物及托管运行适配
├─ website/                   原 trylocode-site，独立构建和部署
├─ native/                    Trylo 的 PTY、WGC 原生辅助程序
├─ third_party/               审计后的上游组件、补丁和来源台账
├─ scripts/release/           源码清单、构建、校验与发布入口
├─ tools/release/             机器可读的公开范围与迁移清单
├─ docs/
│  ├─ architecture/           当前架构、所有权、协议和 ADR
│  ├─ development/            开发、模块扩展和构建步骤
│  ├─ release/                公开边界、提交与打包流程
│  └─ validation/             精选、脱敏、可复核的验收结论
└─ LICENSE / NOTICE / README  沿用公库许可政策，按实际发行闭包更新声明
```

本图是提交目标。第一批已生成目录预览和架构文档，当前源码快照沿用原目录名；LICENSE/NOTICE、构建闭包、旧运行路径清理通过前，预览树不是可发布源码包。依赖继续使用各模块现有锁文件，不在目录迁移中顺带更换包管理器。

## 3. 新版 CLI 内部架构

```text
trylo-cli/
├─ src/cmd/trylo/                 可执行入口及组装
├─ src/internal/
│  ├─ domain/                     状态、命令、审批、权限与 reducer
│  ├─ ports/                      provider、存储、工具等端口
│  ├─ loop/                       调度、流式响应、工具执行、取消恢复
│  ├─ protocol/ + contract/       规范事件、版本与边界校验
│  ├─ surface/cli/                参数、命令和 TUI 展示
│  ├─ surface/protocol/           进程输入输出协议适配
│  ├─ config/ settings/ credentials/
│  ├─ journal/ compaction/ knowledge/
│  ├─ learning/                   控制板、用户学习及 Agent 学习
│  ├─ subagent/ mcp/ tooling/ hooks/
│  ├─ adapters/                   provider、工具、存储、沙箱等 IO 实现
│  └─ integration/ e2e/ evaluation/
├─ scripts/                       编译、质量、合同与发行检查
├─ testdata/                      合成且允许公开的固定夹具
└─ package.json + package-lock.json
```

先保留现有真实模块名，避免只为图好看而重排全部 import。后续合并 config/settings、梳理 protocol/contract 等边界时，需要先确定 canonical 类型和生命周期所有者。

| 职责 | 唯一所有者 | 不应承担的职责 |
| --- | --- | --- |
| Run/Turn 与终态 | domain + loop 中的既有状态机 | UI 卡片或服务层不能另判任务成功 |
| 权限、授权范围与审批 | 核心权限合同与 Permission Service | 学习、provider、工具不得自行扩权 |
| Provider 数据转换 | adapters/provider | provider SDK 类型不得进入核心状态 |
| 工具调用和取消 | loop 的调用生命周期，经 ports 到 adapter | Desktop 不复制工具执行循环 |
| 会话/日志/恢复 | 核心定义恢复语义，存储 adapter 写入 | UI 缓存不能成为执行事实来源 |
| CLI/TUI/stdio | surface | 不新增独立执行状态机 |

执行路径：入口组装 → CLI/协议输入 → 核心命令 → Execution Loop → 权限/工具/provider 端口 → 适配器 → canonical 事件 → 表面投影。终态、拒权、取消、协议失败必须分别可观察；模型自称完成不能替代产物验证。

## 4. 学习的小架构

```text
真实任务证据（按收集与保留规则投影）
          ├─ 用户学习：Evidence → Eligibility → Conclusion
          │             → User Model / Latent Preference
          │             → Policy Compiler → Runtime Resolver
          └─ Agent 学习：能力缺口 → 候选方法/技能/工作流
                        → 隔离验证/外部判定 → 选择/启用/回滚
                ↑
     Learning Control Board：调度对象、时机、预算与治理状态
                ↓
     执行时消费明确版本的策略/方法；权限仍由核心决定
```

用户学习、Agent 学习和执行基底在产品层面同级。学习控制板是独立调度与治理所有者，不是可有可无的记账插件，也不替用户执行生产任务。两类学习不能压成同一个“记忆列表”。学习可以形成可撤销的合作策略和经验证的方法，但不能把用户偏好编译成权限、凭沉默转正、自评通过或默认自改内核。

现有 CLI 学习与 Desktop Services 中旧 Hermes 学习服务同时存在，不能仅改名就宣称统一。公开文档要标明现有接线和目标机制；本批不改学习机制、不扩大收集范围，也不宣称已经证明净收益。

## 5. 桌面端的小架构

```text
desktop/
├─ src/
│  ├─ App.tsx + main.tsx           当前入口；后续收缩为组装
│  ├─ surfaces/                   Code、Work、Team 等产品表面
│  ├─ components/                 共享呈现组件
│  ├─ runtime/ + host-adapter/     CLI 协议、投影、会话监督和 IPC
│  ├─ state/                      视图状态与会话索引
│  ├─ approval/ + permission/     审批交互和权限展示
│  ├─ tooling/                    工具与浏览器面板
│  ├─ learning/ user-learning/ user-profile/
│  ├─ work-chat/ managed-work/ remote/
│  └─ settings/ recovery/ results/ result-dock/
├─ src-tauri/src/commands/        Rust 原生桥接、进程与系统接口
├─ sidecars/                     桌宠与既有隔离辅助组件
└─ scripts/                      开发启动和资源组装
```

Desktop 当前监督会话和进程，CLI 拥有 Agent 执行循环。UI 渲染协议事实、发送用户命令和显示审批；不得根据文本“像完成了”就改终态。Rust 负责原生进程、WebView、文件与 IPC 边界。

后续优先拆 App.tsx 的会话编排、工作区布局、设置入口和表面选择，按照现有所有权逐块抽取，不把几千行转移到新的“大 hook”。此项与新版 CLI 默认切换分别留证。

普通 Work Chat 目前复用 ConversationRunSupervisor 的执行路径；托管 Work 另有适配路径，不把所有 Work 都描述为独立 workd。

## 6. Desktop Services 的小架构

```text
desktop-services/src/
├─ host.mjs                      NDJSON stdin/stdout 与方法注册
├─ protocol/                     帧、错误、版本和 registry
├─ remote/                       网关、配对、身份与隧道
├─ tooling/                      工具包、profile、浏览器和预览服务
├─ learning/                     既有学习服务与 shadow runner
├─ pet/                          原生桌宠通道
└─ pet-chat/                     桌宠对话接线
```

服务宿主只分发方法和生命周期事件；它不是 Agent 内核，也不是当前已存在的统一 app-server。Remote 将用户请求送回 Desktop 的权威路由，不能绕过桌面端的会话、权限和取消语义。tool profile 的创建、工具安装、模型调用和学习预算分别维持各自的唯一写入口。

重点整理 tooling 的包管理、安装验证、profile/runtime registry、原生浏览器会话与预览流，防止所有职责继续堆进 tool-package-manager。shadow runner 必须作为旧协议迁移点单独核验。

## 7. Work 的小架构

```text
work/
├─ src/control-plane/            托管任务的控制命令与合同
├─ src/host-adapter/             宿主及运行时适配
├─ src/deliverables/             交付物生成、解析与登记
├─ src/renderer/                 Work 的视图呈现
├─ src/work-domain.ts            Work 领域概念
├─ src/*reconciler / *reducer     工作流投影与核对
├─ bin/trylo-workd.mjs            当前 workd 发行入口
└─ tests/                        合成任务与交付物验收
```

Work 拥有任务看板、工作流和交付物语义，不另建一套核心权限或 Agent Loop。结果入库要依据实际产物，不能把运行进程退出等同于业务交付成功。

当前 workd 组装仍依赖本地被忽略的 CoWork vendor 完整树及补丁；只提交少量补丁不能保证新克隆可构建。先明确当前依赖和固定获取/组装方法，不因目录整理重新引入或推荐整套上游 runtime。真实任务录像与数据库不入公库；依赖它们的测试要改用可分发的合成夹具，不能靠删除测试做出绿色结果。

## 8. 移动端与网站的小架构

```text
mobile-app/
├─ src/remote/                   远程工作台协议、客户端和视图
├─ src/remoteConnection*         连接生命周期
├─ src/remoteCache* + remoteOffline*
├─ src/secureStorage*            平台凭据存储
├─ src/DirectChatView* + directChat*
├─ src/App* + MobileNavigation*  页面组装与导航
├─ android/                      原生壳与可复现构建配置
├─ scripts/                      预览、同步和签名打包
└─ tests/                        协议与连接合同
website/                         来自 trylocode-site
├─ index.html + assets/
├─ app/                          下载与产品页面
├─ chat/ + remote/
└─ deploy.mjs + 部署配置
```

移动端通过网关消费协议，不直接引用桌面私有文件或取得比 Desktop 更大的执行权限。签名密钥、真实连接缓存、账号凭据和 APK 不进源码提交。

网站保留在本次范围中。站点源码随源码提交；安装包和 APK 放 GitHub Release，网站链接发行制品。部署和源码推送是分开的动作，不在整理时自动部署。

## 9. 原生组件与第三方边界

| 目标位置 | 内容 | 本次处理 |
| --- | --- | --- |
| native/pty | Trylo PTY 的 Rust 源码、Cargo 锁文件、来源说明 | 源码预览纳入；预编译 exe 不进源码包 |
| native/wgc | Trylo WGC helper 的 C# 源码和项目 | 源码预览纳入；移动后组装脚本待接线 |
| third_party | sandbox、Windows-MCP、既有隔离组件的固定来源与补丁 | 先写清台账及缺口，未完成审计/闭包的不假称可构建 |
| desktop/src-tauri/resources | Node、CLI、service、sidecar 的生成资源 | 属于组装产物，不把整棵本机资源缓存上传 |

第三方组件必须带精确版本/提交、来源、许可证、NOTICE、Trylo 修改、进入制品的位置和可替换边界。合法的 Anthropic API/provider 支持与开源 sandbox 归属不是 Claude Code 执行内核；要去掉的是旧内核依赖，不能删除实际依赖的版权声明来制造“零残留”。

## 10. 第一批的边界和后续验收

当前产物是公开目录预览、文件哈希/映射清单和本文，未改业务执行语义、权限或学习行为。

后续按 [迁移顺序](../development/repository-layout.md) 和 [提交与打包](../release/source-submission.md) 执行。预览清单通过只证明选中文件已正确归位；还必须完成路径接线、旧运行依赖清理、固定第三方闭包、干净克隆构建和安装制品验收。发布阻断项保存在机器清单和本地预览报告中。
