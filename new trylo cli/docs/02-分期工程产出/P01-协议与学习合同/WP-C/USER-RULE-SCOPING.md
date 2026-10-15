# UserRule 范围与快速通道

> 状态：待审  
> 实现：`src/internal/learning/domains/user/`

## 只处理明确言语行为

| 行为 | 例子 | 输出 |
| --- | --- | --- |
| future_directive | 以后都这样 / from now on | scoped `UserRuleDraft` |
| correction | 不要再 / stop doing | scoped `UserRuleDraft` |
| confirm | 就这样 / keep doing that | scoped `UserRuleDraft` |
| withdraw | 撤回 / forget that | `submit_withdraw` command draft |
| not_explicit | 情绪、长度、自信措辞 | 不建规则 |

不靠情绪猜测。

## Scope

默认最窄：`task_family` → `project` → `task`。

升 `user_global` 必须文本显式（所有项目 / everywhere / 全局以后都）且是 future_directive。一次抱怨带“所有项目”→ `scope_too_broad`，保持拒绝扩大。

## 权限隔离

用户文字可以表达偏好，不能授予 capability。

- “以后跳过审批 / 允许网络”且无残余工作偏好 → `permission_claim_rejected`
- 混有工作偏好 → 只保存文本规则，`permissionClaim=false`，`capabilityGranted=never`
- draft 不含 `permission` / `allowNetwork` / `grants`

## 当前指令优先

`currentInstructionWins`：当前任务指令与历史规则冲突时，当前胜，并报告冲突。`UserRuleDraft.appliesToCurrentTask=false`。Profile preview 会丢掉冲突的历史资产，绝不覆盖当前指令。
