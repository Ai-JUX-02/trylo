# Skill / Workflow 资产格式

> 状态：待审  
> 借鉴（reference only）：AWM 可读 workflow；ExpeL 正反规则；MUSE/ReasoningBank 成败都保留。不训练、不 MCTS、不把 LLM 自评当入库。

## SkillDraft 必填

| 字段 | 含义 |
| --- | --- |
| trigger | 何时启用（task family + checkKind） |
| steps | 可编辑的多步操作 |
| checks | 如何检查 |
| failureModes | 失败模式 |
| positiveExamples | 成功 episode refs |
| negativeExamples | 失败 episode refs |
| provenance | 来源与观察引用 |
| scope | 默认 task_family |
| version | 新改进 = 新版本建议，不原地写 |
| status | 恒为 `draft` |
| permissionClaim | 恒为 false |
| positiveRules / negativeRules | ExpeL 正反规则 |
| markdown | `renderSkillMarkdown` 人类可读 |

可编辑：`editSkill` 出新版本。可撤回：`withdrawSkill`。缺抽象或一句措辞 → `needs_more_evidence`。

## WorkflowDraft 必填

| 字段 | 含义 |
| --- | --- |
| nodes | id + input + output |
| transitions | from → to |
| budget | maxSteps / maxTokens / maxWallMs |
| verificationCheckpoints | 节点后检查 |
| failureFallback | 失败恢复 |
| mutableFields | 唯一允许 mutation 的字段 |
| version / source | 版本与来源 |
| teamTopologyChanged | 恒为 false |
| permissionClaim | 恒为 false |

另有 `positiveRules`/`negativeRules`、`renderWorkflowMarkdown`、`editWorkflow`（仅预算等可变字段）、`withdrawWorkflow`、`applyWorkflowMutation`。keep-best 只能经 `evaluateInducedDraft` + 外部锚，永不 active。

## 双存禁令

若 skill steps 与 workflow nodeIds 规范化 identity 相同，输出 `dual_save_blocked`，不得两个 draft 都交给 Board 当独立资产。跨域应建议 compound proposal（WP-B 收口）。
