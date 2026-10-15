# Trylo CLI 双循环与学习控制面架构

> 状态：已批准施工基线 v1（依据产品所有者 2026-09-12 明确决策）  
> 当前层级：`TRYLO-LEARNING-AGENT-顶层架构与目标.md` 的下位分权基线；冲突时以上位文档为准  
> 仍有效：执行不拥有学习写入、学习不拥有权限、两环分立、控制板唯一学习治理 writer  
> 已过时解释：把学习限制为执行热路径之外的可选外挂，或把控制板缩成只记账不调度  
> 决策日期：2026-09-12  
> 适用阶段：P01 起  
> 产品决定：学习可以开始进入 Trylo CLI；采用独立 Learning Loop 与中央控制板  
> 不授权：自动下载/安装/切换/修改工具，自动对外提交贡献，学习扩大权限，运行时自改核心代码

## 1. 结论

Trylo 不做一个把所有学习逻辑塞进主 Agent Loop 的“大 Loop”，也不做一个与主 Agent 抢执行权的第二 Agent。采用两个职责严格分开的循环：

1. **Execution Loop** 负责当前任务的模型、工具、权限、取消、恢复和终态；
2. **Learning Loop** 由学习控制板按时机与预算调度，在 intra/inter 两种尺度消费绑定于执行当时的证据，产生、验证、审批、启用或回滚学习资产；
3. **Learning Control Board** 是 Learning Loop 的唯一状态所有者、治理入口与调度器，不是另一个替用户执行任务的 Agent。

LLM 仍是提出假设、归纳经验和生成候选内容的推理者；控制板像“脑干”，只做确定性的调度、约束和生命体征管理。它不直接替 Agent 思考任务，不直接执行工具，不拥有权限。

```text
                       user approval / revoke / rollback
                                      |
                                      v
Execution Loop ---- redacted evidence ----> Learning Control Board
      ^                                      |  single writer
      |                                      v
      |                             domain analyzers/builders
      |                        prompt/user/workflow/tool/verifier
      |                                      |
      |                                      v
      +---- immutable ExecutionProfileSnapshot <---- evaluator
                  (next boundary only)          shadow / compare

Permission Service ------------------------------ sole authority
Tool Runtime ------------------------------------ sole executor
```

## 2. 为什么这是对原架构的优化

原方案中“单执行 Loop + turn 开始装载 + turn 结束投影”这个边界是对的，应保留；不足之处是学习仍被压成了泛化 `Fragment` 和两个函数，无法表达提示词改进、用户 skill、workflow、工具获取、工具改造、证据、审批和回滚各自不同的生命周期。

本方案在 2026-09-12 阶段做了四项调整；其中“两个接点”只是当时的最小接线方式，不是当前产品能力上限：

- 当时先以执行前快照与执行后证据投影两个接点建立最小闭环；当前顶层标准允许受治理的 intra，并保留 Dispatch Image / Experience Fabric 的字段与边界设计空间；
- `knowledge fragment` 不再承担所有语义，改为有类型、有版本、有证据的学习资产；
- “中央控制板”统一治理，不统一生成算法；每个学习域各司其职；
- 提示词、skill、workflow、工具不再分一等二等，统一进入提案—验证—启用生命周期，即“提示词平权”。

这不是把所有东西塞进一个大 `while`。执行与学习仍由两个调度器分权，但学习控制面属于 CLI runtime：它既可以做 inter 的后台归纳，也可以在预算、隐私和治理边界内做 intra 的反思、路由或策略更新。搜索开源工具、隔离评测、工具改造和生成 skill 不得占有执行状态机或权限，但也不能因此被描述成一个可有可无的外围插件。

## 3. 当前仓库事实与必须先还的债

截至 2026-09-12，本目录已经有可保留的成果：严格 TypeScript 配置、Protocol 基础校验、学习不授予权限等约束测试、用户纠正/候选/撤回最小纵切、研究报告和开源参考库。

但它还不是可承载学习控制面的核心地基：

| 事实 | 影响 | 处理包 |
| --- | --- | --- |
| `contract/envelope.ts` 与 `protocol/envelope.ts` 有两份 Envelope | canonical contract 不唯一 | WP-A |
| Fragment、ContextPort、JournalPort 也有重复定义 | 后续四域会继续分叉 | WP-A / WP-B |
| `domain`、`loop`、provider/tool/permission ports 基本是占位 | 尚无真实执行内核 | WP-A |
| CLI 只打印 `trylo-cli p00` | 无可验证的纵向执行路径 | WP-A |
| `npm test` 当前 53 条中 9 条失败 | 陈旧 `dist` 测试与已删除 fixture 污染基线 | WP-A |
| 干净构建又不会发现 `protocol/test.ts` | 测试发现规则存在假绿风险 | WP-A |
| FragmentStore 是无 CAS/锁的 JSON 读改写 | 并发写会丢数据 | WP-B |
| ContextPort 宽泛吞错，异常时连输入 messages 也丢失 | 降级语义不正确且不可观测 | WP-B |
| Journal 只有内存事件，`collect=true` 也没有完整隐私投影 | Learning Loop 没有可信输入 | WP-B |

因此旧工作不是白做：研究结论、协议约束和安全不变量继续使用；重复类型、假绿门禁和占位实现不能伪装成已经完成。

## 4. 三层权力边界

### 4.1 Execution Loop 拥有什么

- 当前 task/turn/attempt 的唯一执行状态；
- provider 流、tool call、approval 等待、取消、重试、恢复与 terminal；
- 使用任务边界冻结的 `ExecutionProfileSnapshot`；
- 向 Journal 写执行事实，但不决定这些事实能否晋升为长期经验。

Execution Loop 不检索 GitHub，不生成长期 skill，不修改工具，不跑后台评测，不写学习资产，不根据学习结果扩大权限。

### 4.2 Learning Loop 拥有什么

- 从已授权的 Journal 投影中检测能力缺口或可复用改进；
- 调用领域分析器生成 typed proposal；
- 安排隔离验证、对照评测、shadow 和回归检查；
- 请求用户审批，或处理用户明确纠正的快速通道；
- 生成下一版本资产和 `ExecutionProfileSnapshot`；
- 监控启用后的效果，触发暂停、回滚或退役。

Learning Loop 不直接修改 Execution Loop 状态，不执行生产工具，不拥有 provider/tool 权限，不把模型自评当通过。

### 4.3 Control Board 拥有什么

控制板是以下对象的唯一 writer：

- `LearningProposal`：想改变什么、为什么、风险和所需授权；
- `EvidenceBundle`：输入证据、外部 verdict、baseline/candidate 差异；
- `LearningAssetVersion`：不可变资产版本及来源；
- `ActivationRecord`：scope 内当前激活版本、shadow 比例、回滚指针；
- `ApprovalRequest`：下载、安装、切换、修改、广域启用、上游提交等请求；
- `ExecutionProfileSnapshot`：某次执行实际采用了哪些资产版本。

控制板不保存隐藏推理，不把原始全量日志当学习数据，不直接存密钥，不执行下载或 shell。

## 5. 早期最小接线（非当前完整 Dispatch Image）

本节记录 2026-09-12 骨架采用的两个边界。它们仍可作为 inter 的稳定边界，但不排除当前顶层标准要求的 intra 调度、任务内反思和下一 iteration 行为变化。字段只是早期实现载体，不得被当成 Dispatch Image、Experience Fabric 或用户政策编译的最终 schema。

### 5.1 执行前：冻结快照

在 task 开始时读取一次快照；默认不在同一 turn 热替换。必要时下一 turn 重新解析，但必须产生新 snapshot ID。

```text
ExecutionProfileSnapshot
  snapshotId
  scope
  userRules[]
  promptPatches[]
  skillRefs[]
  workflowRef?
  toolBindings[]
  requiredCheckRefs[]
  assetVersions{}
  createdFromBoardSequence
```

快照中没有 `permission`、`allowNetwork`、`skipApproval` 或等价能力。工具绑定只说明“可选择哪个工具”；能不能调用仍由 Permission Service 在当次动作上判断。

### 5.2 执行后：写证据投影

Journal 把当前执行事实投影为 `LearningObservation`：

- 输入任务类别与 scope，不默认保存用户原文；
- 实际使用的 snapshot、prompt/skill/workflow/tool 版本；
- 外部 verifier、退出码、测试、用户纠正/确认/撤回；
- cost、latency、重试、工具失败类别等有界指标；
- 因果引用和脱敏报告。

`collect=false` 时不产生学习投影，但不删改 Execution Loop 为恢复和审计所需的运行事实。隐私关闭不能被“为了学习”绕过。

## 6. 学习资产与“提示词平权”

所有可改变未来行为的内容都必须走同一治理外壳。下表是早期 Board 可承载的资产种类，不是 User Intelligence 或 Agent Evolution 的完整本体：

| 资产种类 | 适用内容 | 不应该伪装成它的内容 |
| --- | --- | --- |
| `user_rule` | 早期兼容载体：用户明确偏好、约束、纠正 | 完整 User Model、Latent 或 Policy；未经确认的因果推断 |
| `prompt_patch` | 对 system/developer/task framing 的窄范围改进 | 多步可执行流程 |
| `skill` | 可复用、可解释的操作经验和检查方法 | 单次措辞变化 |
| `workflow` | 有节点、转移、预算、失败路径的过程资产 | 随手写的一段提示词 |
| `tool_binding` | 任务类别到已有工具版本的选择 | 下载或执行权限 |
| `tool_package` | 下载、改造或自建的隔离工具 | 核心 runtime 热补丁 |
| `verification_recipe` | 独立检查方法 | 与生成器同源的自我表扬 |
| `routing_policy` | 在已批准资源内的模型/worker 路由 | Team 权限或拓扑自扩张 |

“平权”指它们都必须说明来源、scope、版本、证据、风险、审批和回滚；不指每次提示词变化都要升级成 skill，也不指模型可以凭感觉自动激活任何资产。

## 7. 两次对话中提示词明显变好的处理

两次对话足以产生高价值信号，但不足以单独证明因果。模型版本、工具、代码基线、任务难度和随机性都可能同时变化。

采用下面的判定：

1. 同一意图族中，记录 baseline 提示、改进提示、采用的资产/工具版本和外部结果；
2. 两个独立实例都显示方向一致的提升时，创建 `prompt_patch`、skill 或用户学习链的候选输入；早期 `user_rule` 只能作兼容投影；
3. 如果只是措辞或角色框架，保留为 `prompt_patch`；如果已形成稳定多步方法，才归纳为 `skill`；
4. 推断候选必须经过 replay/shadow、关键回归检查和独立 verdict；两次成功不能自动 active；
5. 用户明确说“以后这样做”时，形成高权重显式 Evidence；仍须经过 eligibility、结论、用户表示与 policy 编译。其治理路径可以短，但不能跳过语义层，更不能被解释成权限授权；
6. broad/global scope、改变工具或改变 workflow 的资产仍需单独审批；
7. 启用后持续比较效果，恶化、漂移或连续失败时自动 suspend，并保留一键 rollback。

这既比原先只等离线 memory 抽取更快，也能让原系统继续发挥作用：原有纠正/经验抽取成为 observation 和 proposal 来源，而不是直接写最终行为。

## 8. Learning Loop 状态机

统一生命周期如下：

```text
draft
  -> quarantined
  -> evaluating
  -> shadow
  -> awaiting_approval   (需要用户权力时)
  -> active

draft/quarantined/evaluating/shadow -> rejected
active -> suspended -> active | rolled_back | retired
```

硬规则：

- 只有 Control Board 能改变状态；领域 worker 只能提交命令和证据；
- generator 与 evaluator 必须是不同角色/端口；
- LLM 自评分只可用于排序或触发检查，不能产生 `pass`；
- terminal success 与 verified success 分离；
- 同一 proposal 的状态变化有 monotonic board sequence 与 idempotency key；
- 进程崩溃后只从已提交事件恢复，不从文件是否存在猜测成功；
- 连续拒权、连续失败或效果回退触发 breaker，不无界重试；
- active 版本不可原地修改，任何变化产生新版本。

用户明确纠正可以使用窄治理快速通道，但“快”只表示证据资格清楚、审批路径短，不表示把 User Intelligence 压缩成 `user_rule`。早期 `draft -> validated -> active(next boundary)` 仅保留为兼容实现；新施工必须能追溯 Evidence → Eligibility → Conclusion → User Model/Latent → Policy → BehaviorDelta/Receipt，且不能带权限、工具安装、workflow 拓扑或 global scope 的隐式升级。

## 9. 各学习域不得串台

| 组件 | 只负责 | 禁止 |
| --- | --- | --- |
| Observation classifier | 分类信号、关联因果引用 | 写资产、判通过 |
| User/prompt analyzer | 用户证据/结论/表示/政策候选与 prompt_patch 候选 | 把用户学习收成 user_rule；自动改工具或 workflow |
| Skill/workflow inducer | 归纳方法和过程候选 | 自行激活、写权限 |
| Tool curator | 缺口检测、候选工具/补丁计划 | 下载、执行、切换、发布 |
| Candidate builder | 在隔离区生成候选物 | 修改 active 版本 |
| Evaluator | 对照、回归、verdict | 生成被测资产、授予权限 |
| Permission Service | 对具体外部动作授权 | 判断学习质量 |
| Control Board | 学习工单、时机/token 调度、状态转移、版本、审批、激活、回滚 | 执行用户任务、签发权限或自由替 Agent 推理 |

每个 worker 输出 typed proposal 或 evidence，不得直接写另一个域的 store。跨域组合由控制板创建一个显式 compound proposal，逐项列出影响和审批，不能静默连锁修改。

## 10. 工具学习路线

### 10.1 先换工具

当证据显示现有工具缺失或长期不适配时，Tool Curator 后台任务可以搜索开放平台，形成候选比较：能力、接口、维护状态、Windows 支持、许可证、依赖闭包、退出成本和替代品。`open/` 中的仓库一律仍是参考材料，不因已经下载就自动获得产品准入。

准入等级：

- MIT/ISC/BSD/0BSD 为默认优先候选；
- Apache-2.0 只可作为隔离、可替换的非核心工具/adapter，完成 NOTICE/SBOM 与类型泄漏审计后再由用户批准；
- GPL/AGPL、未知许可证、来源不明二进制默认拒绝；
- 任何可能成为核心 runtime、侵入式依赖或长期 fork 的仓库，都必须执行仓库体检和有界 spike，不能只看许可证或 README。

发现与比较可以只读进行；下载代码、运行候选、安装到“我的工具”、切换 active binding 分别是可审计动作，按权限策略请求用户授权。

### 10.2 再升级或自建工具

只有在已有候选无法满足明确 gap 时，才产生 patch/create proposal。生成物必须是进程外、可移除的本地 MCP/插件包，不能让 Agent 直接修改 Trylo runtime 自身。

验证顺序固定为：manifest/schema → 许可证/来源 → 静态检查 → 类型/单元测试 → 沙箱真实执行 → 权限与恶意输入 → 幂等/取消/超时 → 与旧工具对照 → 用户批准 → shadow/active。验证面必须先于生成面。

### 10.3 “我的工具”控制板视图

每个条目至少展示：

- 名称、版本、来源、上游 URL/commit、许可证；
- `direct`、`optimized`、`self_created` 标识；
- quarantine/verified/shadow/active/suspended 状态；
- 能力、所需权限、最近健康检查和验证证据；
- 当前绑定 scope、上一版本和 rollback；
- 是否存在未提交的上游贡献包。

“提交优化”按钮只创建贡献工作流：整理 diff、测试、变更说明、许可证/provenance、上游规范和建议提示词。真正 fork、push、开 issue/PR 或联系维护者必须再次明确授权，绝不自动对外发布。

## 11. 存储与恢复

P01 不把当前 `fragments.json` 继续扩成总数据库。控制板采用事件驱动的单 writer：

- append-only board event 带 sequence、command id 和 checksum；
- 定期写原子 snapshot，加 generation/CAS；
- 读模型可重建，损坏时 fail closed 并暴露 degraded reason；
- observation、proposal、asset、activation 分开命名和保留策略；
- 删除/撤回生成 tombstone 与后续压缩计划，不靠静默覆盖；
- active pointer 与资产内容分离，便于回滚；
- 初期可用标准库文件 adapter，核心只依赖 store port；是否改用 SQLite 由独立 ADR 决定。

Context 降级时必须保留原始 `messages`，只把学习部分置空并写结构化诊断，不能宽泛吞错后返回一份丢消息的“成功”。

## 12. 借鉴边界

本方案采用本地研究中的成熟形状，而不是复制某个项目成为核心：

- AWM：workflow 作为可读资产；
- ExpeL：正反规则池与冲突治理；
- MUSE / ReasoningBank：成功与失败经验都要保留并可归因；
- Voyager：只有外部成功证据才允许技能入库；
- SkillWeaver：未验证能力不可见，验证成熟度可积累；
- DRAFT：从真实工具轨迹改进描述，但结果仍需版本和评测；
- Live-SWE / CREATOR：临时工具与“先设计后调用”的低成本实验；
- OpenCode/Codex/Gemini/Goose 等：provider、tool search、MCP、sandbox、approval 的工程经验。

不进入当前核心：在线训练、MARL、MCTS 架构搜索、运行时自修改、LLM 自评即通过、无审计地从网络执行代码。

## 13. 不变量

1. 学习永远不能扩大权限；
2. Execution Loop 只有一个执行状态所有者；
3. Control Board 只有一个学习状态 writer；
4. 每个公共概念只有一个 canonical contract；
5. 同轮不热替换长期资产；
6. 用户当前指令高于历史推断；
7. 明确纠正与推断候选走不同准入路径；
8. `completed` 不等于 `verified`；
9. 未验证工具不向生产 Agent 暴露；
10. 下载、安装、切换、修改、上游提交均可撤销且受授权；
11. 任何 active 资产能追溯到证据、审批和版本；
12. Learning Loop 不可用时，Execution Loop 仍能使用最后一个有效快照或无学习模式运行。

## 14. 与旧文档的关系

- 保留 `TRYLO-CLI-核心与学习融入方案（过程记录-已过期）.md` 中不与当前顶层冲突的自有 Protocol、单执行 Loop、权限独立和 next-boundary 原则；旧“两接点就是学习全部入口”的解释已失效；
- 用本文件替代该文档 §3 中“只有片段库即可代表学习架构”的范围，以及 §7 的旧四包拆分；
- `ADR-L01-学习进入LOOP的最小权力（过程记录-已过期）.md` 中“不授予权限、推断不自动晋升、collect=false、completed≠verified”等底线继续有效；
- 用户已明确授权开始学习控制面施工，不再把“L01 尚未决定”作为全面停工理由；涉及自动工具动作、广域启用和对外贡献的授权仍未授予。
