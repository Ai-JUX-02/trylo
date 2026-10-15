# WP-C 集成请求（不改他包源码）

> 收口顺序：WP-A → WP-B → WP-C。本包不 import 尚未合并的 worktree。

## 向 WP-B（Learning Control Board）

请接受以下 **command draft**，不要让 C 包复制 Board reducer / active pointer：

1. `submit_draft`：payload 为 `UserRuleDraft` | `PromptPatchDraft` | `SkillDraft` | `WorkflowDraft`，`status` 仅为 `draft`。
2. `submit_evidence`：payload 为 `EvidenceBundle`。`externalPass=true` 且 `verdict=recommend_shadow` 仍不得直接 active。
3. `submit_withdraw`：用户明确撤回。

请拒绝任何来自 C 包的 `activate` / `setActivePointer`。C 包运行时对象也没有这些方法。

请把 `2 次 prompt 提升` 的 `PromptPatchDraft` 送入 quarantined/evaluating/shadow，而不是 next-boundary active。用户明确 `user_rule` 的快速通道仍由 Board 做 scope/冲突/权限校验；C 包已拒绝权限声明。

跨域 `dual_save_blocked` 时，请由 Board 建 compound proposal，不要静默写两个 store。

WP-C 本地类型（`PromptGainEpisode`、`EvidenceBundle` 等）是领域形状，不是 canonical Board 类型。集成时做映射，不要在 C 包再定义一份 lifecycle。

## 向 WP-A（Execution Kernel）

无需本包改 A。将来 Execution Loop 只消费 Board 冻结的 `ExecutionProfileSnapshot`。C 的 profile preview 不是 snapshot writer。

## 向 WP-D

无。工具学习不在本包。prompt patch 若声称 tool_switch，C 已 `forbidden_payload`。

## 向集成者

不要改 `package.json`。C 无新依赖。合并时只加入：

- `src/internal/learning/domains/**`
- `src/internal/learning/pipeline.ts`
- `src/internal/evaluation/**`
- `testdata/learning-domains/**`
- `docs/02-分期工程产出/P01-协议与学习合同/WP-C/**`
