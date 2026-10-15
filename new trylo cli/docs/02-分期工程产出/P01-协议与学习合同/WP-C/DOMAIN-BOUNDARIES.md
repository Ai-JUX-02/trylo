# WP-C 四域边界

> 状态：待审（本包合同）  
> 包：WP-P01-C  
> 工作树：`C:\work\demo-ws-worktrees\wp-p01-c`

## 平权，不混责

提示词、用户规则、skill、workflow 走同一治理外壳（版本、证据、scope、审批、回滚），但分类不同。两次提示词提升不是 skill，也不是自动 active。

本包只输出 domain draft 与 EvidenceBundle。Control Board（WP-B）是 lifecycle / active pointer 的唯一 writer。

## User

- 输入：明确纠正、确认、撤回、“以后这样做”。
- 输出：`UserRuleDraft` 或 `submit_withdraw` command draft。
- 不负责：推断因果、授予权限、归纳 skill/workflow、写 Board store。
- scope 默认窄；升 `user_global` 必须显式。
- 当前任务指令永远高于历史规则；冲突时 `appliesToCurrentTask=false`。

## Prompt

- 输入：带 prompt hash、结构化 patch、task family、version pins、外部 verdict 的独立对话观察。
- 输出：`PromptPatchDraft`（`status=draft`，`activationEligible=false`）或 `insufficient_evidence` / `insufficient_attribution` / `forbidden_payload`。
- 不负责：多步方法、过程拓扑、权限、工具安装/切换、激活。
- 两次可比较、方向一致、有外部结果 → 可以提案；两次成功 ≠ 因果证明 ≠ 启用。

## Skill

- 输入：默认 ≥3 条同 family 的多步轨迹，必须同时有成功与失败。
- 输出：`SkillDraft`（触发、步骤、检查、失败模式、正例、反例、provenance、scope）或 `needs_more_evidence`。
- 不负责：一句措辞、带预算节点的过程、权限、下载、原地改版本。

## Workflow

- 输入：重复出现的节点/转移/失败恢复轨迹。
- 输出：`WorkflowDraft`（节点 IO、transition、budget、checkpoint、fallback、可变字段、版本、来源）或 `needs_more_evidence`。
- 不负责：改变 Team 拓扑、启动 worker、权限、把一段提示词当流程。

## Evaluator / Preview

- Evaluator 只评已有 draft，产出 EvidenceBundle；不能 propose/induce/activate。
- Profile preview 只预览冲突、token budget、确定性顺序和来源标记；不写 snapshot。
- 跨域：同一规则不得 skill+workflow 双存；应输出 `dual_save_blocked` 或 compound suggestion。
