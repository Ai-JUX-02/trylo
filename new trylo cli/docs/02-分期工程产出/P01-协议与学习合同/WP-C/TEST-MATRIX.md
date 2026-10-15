# WP-C 测试矩阵与证据

> 工作树：`C:\work\demo-ws-worktrees\wp-p01-c`  
> 命令：`npx tsc -p tsconfig.json` 后 `node --test "./dist/internal/learning/**/*.test.js" "./dist/internal/evaluation/**/*.test.js"`

| # | 场景 | 期望 | 测试 |
| --- | --- | --- | --- |
| 1 | 两个可比较实例、prompt-only、外部改善 | PromptPatchDraft，不 active | prompt.test.ts |
| 2 | 一次改善 | insufficient_evidence | prompt.test.ts |
| 3 | model 同时变化 | insufficient_attribution | prompt.test.ts |
| 4 | toolset 同时变化 | insufficient_attribution | prompt.test.ts |
| 5 | codeBaseline 同时变化 | insufficient_attribution | prompt.test.ts |
| 6 | workflow 同时变化 | insufficient_attribution | prompt.test.ts |
| 7 | 不相似 intentClass | insufficient_attribution | prompt.test.ts / adversarial |
| 8 | “以后都这样” | scoped UserRuleDraft | user.test.ts |
| 9 | 撤回 | withdraw command | user.test.ts |
| 10 | 跳过审批 | 不产生 permission | user.test.ts |
| 11 | 允许网络 | permission_claim_rejected | user.test.ts |
| 12 | 三条多步经验含失败 | SkillDraft 全字段 | skill.test.ts |
| 13 | 一句更好措辞 | 不是 Skill | skill.test.ts |
| 14 | 稳定节点/转移/fallback | WorkflowDraft | workflow.test.ts |
| 15 | 只有 LLM 自评 | no_external_pass | evaluation.test.ts |
| 16 | 关键回归失败 | critical_regression | evaluation.test.ts |
| 17 | 当前任务 vs 历史资产 | 当前胜并报告冲突 | evaluation.test.ts / user.test.ts |
| 18 | profile 超预算 | 裁剪且保留当前指令 | evaluation.test.ts / adversarial |
| 19 | 长输出当高质量 | 质量分不随长度升 | evaluation.test.ts / adversarial |
| 20 | 自生成测试假成功 | 不能锚定 | prompt.test.ts / evaluation.test.ts |
| 21 | 一次抱怨升 global | scope_too_broad | user.test.ts / adversarial |
| 22 | patch 偷带 permission/tool | forbidden_payload | prompt.test.ts / adversarial |
| 23 | skill 与 workflow 双存 | compound_proposal_suggestion，不双写 | workflow.test.ts / dispatch |
| 24 | evaluator 自我批准 | 分权检查 + no_external_pass | evaluation.test.ts / boundary.test.ts |
| 25 | token budget 裁当前指令 | 禁止 | adversarial.test.ts |
| 26 | 弱信号不再投诉 | 不建强候选 / no_external_pass | adversarial.test.ts |
| 27 | completed 无 verifier | externalPass=false | adversarial.test.ts |
| 28 | 同名 skill 新改进 | 新版本 | skill.test.ts |
| 29 | workflow 重复不足 | needs_more_evidence | workflow.test.ts |
| 30 | hidden CoT | hidden_cot_rejected | evaluation.test.ts |
| 31 | 敏感正文 | rawUserTextStored=false | fixtures + drafts |
| 32 | generator activate | 源码无 activate( | boundary.test.ts |
| 33 | checkKind 不同 | insufficient_attribution | adversarial dissimilar |
| 34 | 方向不一致 | insufficient_evidence | prompt.test.ts |
| 35 | 同一 conversationId | insufficient_evidence | prompt.test.ts |

C7 反方攻击全部有对应 `adversarial.test.ts` 用例。

C8-FIX 增补：checkKind/checkSchema、malformed_input、ops 偷带、措辞路由、structured diff、merge/reject、confirm、skill download、workflow mutation、弱信号 fixture、garbage JSON、replay/sampleConfidence、自生成锚剥离、cost/latency Goodhart、rendered sourceMark。

C10–C13：撤回、keep-best、置信区间、judge rubric、preview 去重/泄漏/snapshot、patch 目标指标、user diagnostics、fail-closed parse、dispatch 禁双存、`proposeThenEvaluatePrompt`、`appliesToCurrentTask`、`EXIT-GATES.md`。

C9 证据索引：`EXIT-GATES.md`。
