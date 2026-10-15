# WP-P01-C STATE（append-only）

> 包：提示词、用户、Skill 与 Workflow 学习  
> 工作目录：`C:\work\demo-ws-worktrees\wp-p01-c`（专用 worktree，禁止写 `C:\work\demo-ws\new trylo cli`）  
> 基线提交：`4c3f56554b717dd194d3a7daee60ad8941eeaec2`  
> Node：v24.14.1　npm：11.11.0　TypeScript：5.8.3  
> `$trylo-code-quality` SHA256：`E2342D39B6506ED7C126987B3E50BF9D5215D514B3665B84759C5BF512A3D9AF`  
> 本包输出：domain draft + EvidenceBundle。禁止 active pointer、Board store writer、Permission、Loop、tooling、package manifest。

## 开工卡（写生产代码前必须完成）

本段冻结行为合同。后续 checkpoint 只允许 append，不得改写已冻结规则。

### 产品问题的直接答案

两次独立对话里，用户对提示词的改进都伴随明显工程结果提升：

1. 两次可比较、方向一致、有外部 outcome/verdict → 可以产生高价值 `PromptPatchDraft` proposal。
2. 两次成功 ≠ 因果证明 ≠ 自动 active。
3. 混杂因素过多 → `insufficient_attribution`。
4. 只有一次成功 → `insufficient_evidence`。
5. Detector 不晋升。Evaluator 只出 EvidenceBundle。Board（WP-B）才是 lifecycle writer。

### 四域边界

| 域 | 只负责 | 不负责 | 输出 |
| --- | --- | --- | --- |
| User | 用户明确纠正/确认/撤回/“以后这样做”；窄 scope；当前指令优先 | 推断因果、权限授予、skill/workflow 归纳、激活 | `UserRuleDraft` 或 `withdraw` command draft |
| Prompt | framing、角色、约束、上下文组织、措辞、工具描述模板；结构化 patch；两次提升检测 | 多步方法、过程拓扑、权限、工具安装/切换、激活 | `PromptPatchDraft` 或 attribution failure |
| Skill | 可复用多步做法 + 检查 + 失败模式 + 正反例 | 单次措辞、带节点预算的过程、权限、下载、原地改版本、激活 | `SkillDraft` 或 `needs_more_evidence` |
| Workflow | 节点/IO/transition/budget/checkpoint/fallback；显式可变字段 | Team 拓扑、启动 worker、权限、把一段提示词当流程、激活 | `WorkflowDraft` 或 draft-hold |
| Evaluator | baseline vs candidate、外部锚定、回归、Goodhart 防护、EvidenceBundle | 生成被测资产、填写 Board active、把 LLM 自评当 pass | `EvidenceBundle` |
| Profile preview | 纯预览冲突/token/确定性/来源标记 | 写 snapshot、裁掉当前指令、hidden CoT 资产 | `ProfilePreview` |

跨域：必须显式多个 draft 或 `compound_proposal_suggestion`。任一域不得直接写另一域资产。skill 与 workflow 不得双重保存同一规则。

### 每一域输入 / 不负责清单（可测试）

**User 输入**：带 speech-act 标记的用户事件（explicit 文本，非情绪分数）。  
**User 不负责**：把“跳过审批/允许网络”变成 capability；一次抱怨升 global；覆盖当前任务指令。

**Prompt 输入**：两次（或以上）observation，含 prompt hash、patch、task family、version pins、external verdict。  
**Prompt 不负责**：在 model/tool/code/workflow 同时变化时硬归因；一次成功建强候选；把 patch 当 skill。

**Skill 输入**：≥ 默认 3 条同 family 的多步轨迹（成功与失败都要）。  
**Skill 不负责**：一句更好措辞；可执行权限；隐式下载；空泛 best practice。

**Workflow 输入**：重复出现的节点/转移/失败恢复轨迹。  
**Workflow 不负责**：改变 Team 规模/权限/provider；无足够重复时写成 active 过程。

### Task family 可比较条件

两个 observation 可比较，当且仅当同时满足：

1. `intentClass` 相同（例：`fix_failing_unit_test` ≠ `write_release_notes`）。
2. `checkKind` 相同（`unit_test` / `compile` / `lint` / `acceptance`）。
3. `language` 相同（若双方都声明）。
4. `repoKind` 相同（若双方都声明）。
5. 输入 schema 同类（同检查命令族，而非仅标题相似）。
6. 对话独立（不同 `conversationId`）。

任一条件失败 → 不可比较 → 不得把结果差归因于 prompt。

### Prompt improvement 因果归因规则

归因窗口只承认 **prompt-only delta**：

- 必须记录：baseline prompt hash、candidate patch、task family、model/tool/code/workflow 版本、两组 causal observation refs、external result、expected benefit、regression risks、privacy/provenance。
- 失效混杂：model 变、toolset 变、codeBaseline 变、workflow 变、任务难度族变。出现任一 → `insufficient_attribution`，不硬归因。
- 外部锚定：测试/编译/静态检查/验收器 verdict、工具退出码、用户验收、独立 verifier。`completed` 不是 verified。
- LLM 自评、输出变长、token/step 变多、用户不再投诉、自生成测试全绿：弱信号，不可产生 external pass，不可单独建强候选。
- 默认阈值配置化但固定语义：`2 次 = 可以提案，不等于可以启用`。
- 本包任何函数都不得返回 `active` 或调用 Board activation。

### User explicit vs inferred 分流

| 信号 | 路径 | 默认 scope | 可否强候选 |
| --- | --- | --- | --- |
| 用户明确“以后这样做/以后都这样/from now on always” | UserRule 快速通道 | 窄（task_family 或 project）；global 必须显式 | draft command，不带权限 |
| 明确纠正（不要再/don't/stop doing X） | UserRule 纠正 | 窄 | 同上 |
| 明确确认（就这样/keep doing that） | UserRule 确认 | 窄 | 同上 |
| 明确撤回 | withdraw command draft | 原 scope | 不激活新资产 |
| 两次 prompt 改进 + 外部提升 | PromptPatch inferred | task_family | proposal only |
| 一句措辞变化 | PromptPatch 或忽略 | task_family | 不是 skill |
| 三条相似多步经验 | Skill inducer | task_family | draft，含失败经验 |
| 稳定节点/转移/预算/fallback | Workflow inducer | task_family | draft |
| 模型自称更好 | 弱信号 | — | 否 |
| 当前用户指令 vs 历史规则 | 当前胜，报告冲突 | 当前任务 | 历史不得覆盖 |

### Generator / Evaluator 分权

- Generator（四域 builder/inducer/detector）：只产出 draft / insufficient_* / needs_more_evidence / rejected。端口禁止 `activate`、`setActive`、`writeBoardState`、`pass`。
- Evaluator：只消费已有 draft + observations，产出 EvidenceBundle。禁止 `propose`、`induce`、`buildDraft`、`activate`。
- 同一角色 id 不得既生成又批准。若 evidence 仅来自生成器自评或自生成测试 → `no_external_pass`。
- LLM critique 只能进 `weakSignals`，不能填写 `externalPass=true`。
- 关键回归失败 → `reject`，即使主指标上升。

### 失败语义

| 码 | 含义 | 下一步 |
| --- | --- | --- |
| `insufficient_evidence` | 观察次数不足或无外部结果 | 不建强候选 |
| `insufficient_attribution` | 不可比较或混杂过多 | 不把结果归功于 prompt |
| `needs_more_evidence` | skill/workflow 抽象不足 | 不写空泛资产 |
| `permission_claim_rejected` | 文本试图授予能力 | 不产生 capability；可保留纯文本偏好并打标 |
| `scope_too_broad` | 一次事件要升 global 但无显式授权 | 保持窄 scope 或拒绝扩大 |
| `forbidden_payload` | patch/skill/workflow 偷带 permission/tool switch/topology | 拒绝该 draft |
| `dual_save_blocked` | 同一规则将被 skill 与 workflow 双存 | 只出 compound suggestion |
| `no_external_pass` | 无外部锚定或仅弱信号 | EvidenceBundle 不得当通过 |
| `critical_regression` | 主指标升、关键回归失败 | reject |
| `current_instruction_wins` | 历史资产与当前指令冲突 | 预览保留当前指令并报告冲突 |
| `budget_trim_reported` | 超预算 | 按优先级裁剪并报告，永不静默、永不裁当前指令 |

### 资产最低字段

**SkillDraft** 必须同时包含：触发条件、操作步骤、检查方法、失败模式、正例、反例、provenance、scope。

**WorkflowDraft** 必须同时包含：节点及输入输出、transition、budget、verification checkpoint、failure/fallback、明确可变字段、版本与来源。

**PromptPatchDraft** 必须同时包含：baseline prompt hash、candidate patch、task family、version pins、两组 causal refs、external result、expected benefit、regression risks、privacy/provenance。

Prompt/skill/workflow 均不得携带 permission。

### 风险测试矩阵（≥25 行，开工前冻结）

| # | 场景 | 期望 |
| --- | --- | --- |
| 1 | 两个可比较实例、prompt-only delta、外部结果改善 | PromptPatchDraft，status=draft，不 active |
| 2 | 一次改善 | insufficient_evidence |
| 3 | 两次改善但 model 同时变化 | insufficient_attribution |
| 4 | 两次改善但 toolset 同时变化 | insufficient_attribution |
| 5 | 两次改善但 codeBaseline 同时变化 | insufficient_attribution |
| 6 | 两次改善但 workflow 同时变化 | insufficient_attribution |
| 7 | 两个不相似 intentClass | insufficient_attribution，不得建 patch |
| 8 | 用户明确“以后这样做” | scoped UserRuleDraft |
| 9 | 用户撤回 | withdraw command draft |
| 10 | 文本要求跳过审批 | 不产生 permission；permission_claim_rejected 或纯文本偏好 |
| 11 | 文本要求允许网络 | 同上 |
| 12 | 三条相似多步经验（含失败） | SkillDraft 带正反例/检查/失败模式 |
| 13 | 只有一句更好措辞 | PromptPatch 或忽略，不是 Skill |
| 14 | 稳定节点/转移/失败恢复 | WorkflowDraft |
| 15 | evaluator 只有 LLM 自评 | no_external_pass |
| 16 | candidate 提升但关键回归失败 | reject / critical_regression |
| 17 | 当前任务与历史资产冲突 | 当前任务胜并报告冲突 |
| 18 | profile 超预算 | 确定裁剪且保留当前指令 |
| 19 | 长输出被当作高质量 | 质量分不随长度上升 |
| 20 | 自生成测试制造假成功 | 不得单独锚定 externalPass |
| 21 | 用户一次抱怨被泛化为 global | scope 保持窄；scope_too_broad |
| 22 | prompt patch 偷带 permission/tool switch | forbidden_payload，拒绝 |
| 23 | skill 与 workflow 双重保存同一规则 | dual_save_blocked |
| 24 | evaluator 与 generator 串成自我批准 | 机器检查分权；无 external pass |
| 25 | token budget 裁掉当前用户指令 | 禁止；当前指令不可裁 |
| 26 | 仅弱信号（不再投诉） | 不建强候选 |
| 27 | completed 无 verifier | verified=false，不得当 pass |
| 28 | 同名 skill 新改进 | 新版本建议，不原地写 |
| 29 | 无足够重复的 workflow 轨迹 | 保留 draft/needs_more_evidence，不假装稳定过程 |
| 30 | 隐藏 CoT 作为资产 | 拒绝；preview 不含 hidden reasoning |
| 31 | 敏感用户正文进入 draft | 只存 hash/指针/允许字段 |
| 32 | generator 调用 activate | 编译/运行时均无此方法 |
| 33 | checkKind 不同仍归因 | insufficient_attribution |
| 34 | 方向不一致的两次外部结果 | 不建强候选 |
| 35 | 同一 conversationId 的两次观察 | 不算两个独立对话 |

## Checkpoint 总表

| ID | 状态 | 产出 | 下一动作 |
| --- | --- | --- | --- |
| 开工卡 | 已落盘 | 本文件冻结段 | C0 |
| C0 | 待做 | task family + attribution + fixtures | C1 |
| C1 | 待做 | UserRule builder | C2 |
| C2 | 待做 | PromptPatch detector/builder | C3 |
| C3 | 待做 | Skill inducer | C4 |
| C4 | 待做 | Workflow inducer | C5 |
| C5 | 待做 | 独立 evaluator | C6 |
| C6 | 待做 | Profile preview | C7 |
| C7 | 待做 | 反方审计 + 文档 + RUN | Exit |

## 日志

### 开工 2026-09-12

- 已读：AGENTS.md、`$trylo-code-quality`、双循环架构全文、P01 四并行规格、WP-P01-C 全文。
- 已读研究：`open/report/prompt-optimization/05-trylo-cli-prompt.md`；workflow `05` + `80-workflow-frontier-feasibility.md`；temporal `05` + `80`；reward `05` + `80`；AWM/ExpeL/MUSE/ReasoningBank 的 prompt 报告。
- 明确不采用：线上训练、TextGrad 改生产 prompt、MARL、MCTS/超网、LLM 自判绝对通过。借鉴：候选生成、正反经验、keep-best 需外部评测、失败也保留、可读 workflow 资产。
- 文件所有权仅限 `learning/domains/{user,prompt,skill,workflow}`、`evaluation`、`testdata/learning-domains`、WP-C 文档。
- 物理隔离：`C:\work\demo-ws-worktrees\wp-p01-c`，不与 WP-A/B/D 或 `new trylo cli` 共用目录。
- 下一动作：C0 实现 task family 与 attribution，并建立 positive/negative/ambiguous fixtures。未完成开工卡前禁止生产代码；本段完成后进入 C0。

### C0 2026-09-12

- 状态：已落盘
- 产出：`prompt/task-family.ts` `prompt/attribution.ts`；fixtures `testdata/learning-domains/{positive,negative,ambiguous}/`
- 最窄测试：`npx tsc -p tsconfig.json`；`node --test "./dist/internal/learning/domains/prompt/prompt.test.js"` 退出码 0
- 规则已实现：可比较条件、混杂失效、1 次=`insufficient_evidence`、2 次可提案不可启用

### C1 2026-09-12

- 状态：已落盘
- 产出：`user/builder.ts` `speech-act.ts` `scope.ts` `user.test.ts`
- 最窄测试：`node --test "./dist/internal/learning/domains/user/user.test.js"` 退出码 0
- 明确纠正/确认/撤回；窄 scope；跳审批/允许网络不产生 permission；当前指令胜

### C2 2026-09-12

- 状态：已落盘
- 产出：`prompt/detector.ts` `builder.ts` `patch.ts`
- 最窄测试：prompt.test.js 退出码 0
- detector 记录 baseline hash、patch、family、version pins、两组 refs、external、benefit、risks、privacy；偷带 permission/tool → `forbidden_payload`

### C3 2026-09-12

- 状态：已落盘
- 产出：`skill/inducer.ts` `skill.test.ts`
- 最窄测试：skill.test.js 退出码 0
- SkillDraft 含触发/步骤/检查/失败/正反例/provenance/scope；一句措辞不升级；同名出新版本

### C4 2026-09-12

- 状态：已落盘
- 产出：`workflow/inducer.ts` `workflow.test.ts` `shared/dual-save.ts`
- 最窄测试：workflow.test.js 退出码 0
- 节点/IO/transition/budget/checkpoint/fallback/可变字段/版本来源；双存 blocked

### C5 2026-09-12

- 状态：已落盘
- 产出：`evaluation/evaluator.ts` `ports.ts` `goodhart.ts` `boundary.test.ts`
- 最窄测试：evaluation.test.js + boundary.test.js 退出码 0
- generator 无 evaluate；evaluator 无 propose；LLM 自评不能 externalPass；关键回归 reject

### C6 2026-09-12

- 状态：已落盘
- 产出：`evaluation/profile-preview.ts`
- 最窄测试：evaluation.test.js 中 preview 用例 退出码 0
- 冲突报告、token 裁剪报告、当前指令不可裁、确定性 fingerprint

### C7 2026-09-12

- 状态：已落盘
- 产出：`adversarial.test.ts`；DOMAIN-BOUNDARIES / PROMPT-ATTRIBUTION-RULES / USER-RULE-SCOPING / SKILL-WORKFLOW-ASSET-FORMATS / EVALUATION-AND-GOODHART / TEST-MATRIX / QUALITY-AUDIT / INTEGRATION-REQUESTS / RUN
- 最窄测试：adversarial.test.js 退出码 0
- 全量 `npm test` 干净 dist 两次：70 pass / 0 fail，退出码 0
- 作者审/反方审：无 P0/P1

### C9 Exit gates 2026-09-12

- 四域边界：DOMAIN-BOUNDARIES.md + STATE 开工卡
- 2 次=proposal 不是 activation：prompt.test.ts `activationEligible === false`
- 分类正反例/ambiguous：testdata/learning-domains + 各域测试
- generator 不能激活：boundary.test.ts 无 `activate(`
- evaluator/generator 分权：ports.ts + evaluation.test.ts + boundary.test.ts
- external vs critique：ExternalVerdict vs WeakSignal；自评 → no_external_pass
- 当前指令优先与权限隔离：user.test.ts + preview 冲突/裁剪测试
- skill/workflow 失败经验与 provenance：skill.test.ts / workflow.test.ts
- preview 冲突/budget/确定性：evaluation.test.ts
- 无网络/无新依赖：未改 package.json
- 作者审/反方审无 P0/P1：QUALITY-AUDIT.md
- RUN 按矩阵而非测试数：TEST-MATRIX.md + RUN.md

终态：**COMPLETE**（已作废：外部审计前无完成判定权）

### C8-FIX 2026-09-12（反方审缺口，施工中）

COMPLETE 作废。不得停。发现并修复：

- P1 task family 未比较 `checkSchema`（检查命令族）
- P1 patch/skill/workflow 未扫描正文偷带 permission
- P1 无 fail-closed 输入解析与故障注入
- P1 一句措辞未路由到 prompt 域
- P1 无 reject/merge/近重复聚合
- P1 evaluator 未过滤自生成锚、未做多指标 Goodhart、无 replay/负例 critique
- P1 workflow mutation 未限制在 mutableFields
- P1 双存只失败、未输出 compound_proposal_suggestion
- P1 preview 无带来源标记的稳定渲染序
- P1 若干 negative/ambiguous fixtures 是空壳，未真正加载

### C8-FIX 2026-09-12（已落盘）

- 已修 P1：checkSchema/checkKind、ops/body 偷带、fail-closed parse、措辞→prompt_patch、merge/reject、mutation 闸、compound suggestion、evaluator 多指标/replay/负例/锚过滤、preview 渲染序、真实 ambiguous fixture
- 最窄测试：learning+evaluation 64 pass
- 干净 `npm test` 两次：88 pass / 0 fail，退出码 0

### C9 外部审计准备 2026-09-12

- 作者审/反方审第二轮：QUALITY-AUDIT.md，无剩余 P0/P1
- RUN.md 已记两次干净构建
- 终态：**READY_FOR_EXTERNAL_AUDIT**
- 禁止 COMPLETE；等待外部审计 ACCEPTED

### Checkpoint 完成表（append，不改冻结开工卡）

| ID | 终态 |
| --- | --- |
| 开工卡 | 已落盘 |
| C0–C7 | 已落盘 |
| Exit | 见 RUN.md；外部审计前禁止 COMPLETE |

### C10-HARDEN 2026-09-12（施工中）

READY_FOR_EXTERNAL_AUDIT 不是停工。继续补合同缺口：

- Skill/Workflow 可撤回 command draft
- keep-best 必须经外部评测
- EvidenceBundle 置信区间
- Profile 重复检测与 scope 泄漏
- PromptPatch 适用 scope 与目标指标
- 结构化 judge rubric 只能弱信号
- UserRule conflict/scope diagnostics
- 空壳 negative fixtures 换成可加载证据

### C10-HARDEN 2026-09-12（已落盘）

- skill/workflow `submit_withdraw`；keep-best 不激活；Wilson 置信区间；judge rubric 弱信号；preview 去重与 global scope 泄漏；PromptPatch scope/patchTarget/targetMetric；UserRule diagnostics；negative fixtures 可加载
- 干净 `npm test` 两次：96 pass / 0 fail，退出码 0
- 终态仍为 **READY_FOR_EXTERNAL_AUDIT**，禁止 COMPLETE

### C11-HARDEN 2026-09-12（施工中）

仍未停。补：空壳 skill/workflow/model-tool fixtures；user conflictWithCurrent 真比较；skill/workflow 可编辑新版本；四域 dispatch 禁双存；preview snapshot 四槽；evaluator deterministicChecks + shadow 标记。

### C11-HARDEN 2026-09-12（已落盘）

- 真实 skill/workflow/model-tool fixtures；user `conflictWithCurrent`；`editSkill`/`editWorkflow` 新版本；`dispatchLearning` 双存改 compound；preview snapshot 四槽；`deterministicChecks` + `shadowRecommended`
- 干净 `npm test` 两次：100 pass / 0 fail，退出码 0
- 终态：**READY_FOR_EXTERNAL_AUDIT**，禁止 COMPLETE

### C12-HARDEN 2026-09-12（施工中）

未停。补：PromptPatch `expectedOutcome`；EvidenceBundle 记录 threshold 与 successRate；skill/workflow 可读 markdown + ExpeL 正反规则；evaluator 消费 draft；fixture 经 fail-closed parse 加载。

### C12-HARDEN 2026-09-12（已落盘）

- `expectedOutcome`；`successRate`+`threshold` 进 EvidenceBundle；`evaluatePromptPatchDraft`；skill/workflow markdown 与正反规则；`parsePromptEpisodeList` fail-closed
- 干净 `npm test` 两次：103 pass / 0 fail，退出码 0
- 终态：**READY_FOR_EXTERNAL_AUDIT**，禁止 COMPLETE

### C13-HARDEN 2026-09-12（施工中）

未干完。补 skill/workflow fail-closed parse、detector→evaluate→keepBest 单入口（域外 pipeline，不破坏分权）、冲突规则 `appliesToCurrentTask=false`、文档对齐实现。

### C13-HARDEN 2026-09-12（已落盘）

- `parseSkillEpisodeList` / `parseWorkflowEpisodeList`；`proposeThenEvaluatePrompt` 永不 activate；冲突 user_rule `appliesToCurrentTask=false`
- 干净 `npm test` 两次：106 pass / 0 fail，退出码 0
- 终态：**READY_FOR_EXTERNAL_AUDIT**。实现合同已齐；激活权在 Board/外部审计，本包不能 COMPLETE。

### C14-HARDEN 2026-09-12（施工中）

继续：C9 `EXIT-GATES.md` 证据索引；`evaluateInducedDraft`；文档对齐；exit-gates 合同测试。

### C14-HARDEN 2026-09-12（已落盘）

- `EXIT-GATES.md` 逐条证据；`exit-gates.test.ts` 禁止用测试数量代替覆盖；`evaluateInducedDraft` 永不 activate
- 干净 `npm test` 两次：108 pass / 0 fail，退出码 0
- 工作包实现合同已对齐。本包不写 Board active。

### C15-AUDIT 2026-09-12（施工中）

对抗性复核：`workflow/parse-episode.ts` import `skill/parse-episode.ts`，跨域泄漏。将 `parseTrajectory`/`parseEpisodeArray` 上收到 shared。

### C15-AUDIT 2026-09-12（已落盘）

- parse 上收到 shared；`boundary.test.ts` 禁止四域互引
- 干净 `npm test` 两次：109 pass / 0 fail，退出码 0
- 未声称外部验收

### C16-AUDIT 2026-09-12（施工中）

对抗性复核：C9「无真实 provider/network」无机器检查；RUN diff 范围漏 `pipeline.ts`/`EXIT-GATES.md`。

### C16 closed 2026-09-13

- 上一节 C16-AUDIT（施工中）保留原文不改写；本节为关闭记录。
- 新增机器检查 `src/internal/learning/io-boundary.test.ts`：
  - 按模块说明符解析 import/require/动态 import，拦截 `node:http`/`node:https`/`node:net`/`node:tls`（含 `node:dns`/`node:dgram` 与裸名）、`undici`、provider SDK（openai/@openai/anthropic/@anthropic-ai/@google/generative-ai/@azure/openai/ollama/mistralai/cohere/@aws-sdk）与生产代码 `fetch(` 直接调用；
  - 层级检查：learning 与 evaluation 生产代码禁止 import `adapters`/`loop`/`reducer(s)`/`permission(s)`/`desktop`/`ui`/`open`；
  - 反误报测试：`allow_network`、`curl http` 字符串与 `node:crypto` 不触发；
  - 反例 fixtures：`testdata/architecture/forbidden-learning-import-network.ts`、`testdata/architecture/forbidden-learning-import-permission.ts`。
- RUN.md 新增「审计范围（C16 机器检查）」，明确含 `src/internal/learning/pipeline.ts` 与 `WP-C/EXIT-GATES.md`；`exit-gates.test.ts` 新增用例断言两者存在。
- 实际命令与退出码：
  - `npx tsc -p tsconfig.json` → 0
  - `node --test "./dist/internal/learning/io-boundary.test.js" "./dist/internal/evaluation/exit-gates.test.js" "./dist/internal/evaluation/boundary.test.js"` → 0（11 pass / 0 fail）
- 失败反例（证明检查 fail-closed）：
  1. 临时放入 `src/internal/learning/__tmp-violation.ts`（`import { request } from "node:http"`）→ io-boundary 测试 1 fail，violation 列出该文件；已删除该临时文件及其 dist 产物。
  2. 临时将 RUN.md 中 `src/internal/learning/pipeline.ts` 替换为占位名 → exit-gates 测试 1 fail（"RUN.md audit scope…"）；已从备份恢复，恢复后 2 pass / 0 fail。

### 收口审计 closed 2026-09-13

- 阶段二逐项完成：四域输入/输出/owner/不负责内容与代码逐条对上（prompt/attribution、user/speech-act+scope、skill/inducer、workflow/inducer+mutate）；1 次提升只出 `insufficient_evidence`；2 次可比提升只出 proposal（`activationEligible:false` 贯穿 record/draft/pipeline/keepBest）；model/tool/code/workflow 任一同时变化 → `insufficient_attribution`；generator 无 activate（boundary + assertNoActivation）；judge rubric 只进 weakSignals，自评无法 externalPass；current instruction 胜（appliesToCurrentTask/preview conflict trim）；正文偷带权限或 tool switch → forbidden_payload。
- pipeline 复核：只组合 detect→evaluate→keepBest，无 Board lifecycle/持久化/状态转移；四域互不 import（机器检查）；shared 仅公共机械逻辑；skill/workflow 同 identity 双存 → compound suggestion。
- 交付清单：新增 `HANDOFF-MANIFEST.md`（文件、Board command 映射、类型边界、测试证据、导入顺序、回滚、P2 风险）；QUALITY-AUDIT.md 增 C16 收口轮（反方审击穿并修复全局 WebSocket 漏检）；RUN.md 增「C16 收口运行记录」。
- 验证：干净 dist `npm test` 两次均 116 pass / 0 fail 退出码 0，测试名清单 diff 一致且与源码 test() 定义数闭合；`git diff --check` 退出码 0；TEST-MATRIX 第 30 行证据指针修正为真实测试文件。
- 反方审无 P0/P1；残余 P2 见 HANDOFF-MANIFEST §7。无跨包阻塞。

### 终态

**READY_FOR_INTEGRATION_CANDIDATE**（2026-09-13）。不写 ACCEPTED/COMPLETE；集成与激活判定权在 WP-B Board 与外部审计。执行者到此停止，不自动续跑。
