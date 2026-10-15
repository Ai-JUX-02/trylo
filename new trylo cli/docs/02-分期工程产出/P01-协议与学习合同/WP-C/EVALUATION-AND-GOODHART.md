# 评测分权与 Goodhart 防护

> 状态：待审  
> 实现：`src/internal/evaluation/`

## 分权

| 角色 | 可以 | 不可以 |
| --- | --- | --- |
| Generator | propose draft | evaluate、activate、写 Board state |
| Evaluator | 对照、回归、EvidenceBundle | propose、induce、activate |

运行时：`assertRoleSeparation`。同源：`boundary.test.ts` 扫描 generator 不 import evaluator、双方都不调用 `activate(`。

同一 `roleId` 既生成又批准 → `no_external_pass`。

## 锚定

外部 pass 只能来自独立 `test` / `exit_code` / `user_acceptance` / `independent_verifier`，且 `selfGenerated=false`。

LLM critique、长度、token、不再投诉、自生成测试只进 `weakSignals`，不能填写 `externalPass=true`。

`completed` ≠ verified。

## 结论枚举

`recommend_shadow` | `reject` | `insufficient_sample` | `no_external_pass` | `critical_regression`

即使 `recommend_shadow` 也只提交 `submit_evidence`，不是 active。主指标上升但关键回归失败 → `critical_regression`。

## Goodhart

- 质量分忽略输出长度
- 不能只优化一个易作弊指标
- 保存负例与失败 notes
- 样本 < 2 → `insufficient_sample`

## Profile preview

纯预览。优先级：当前指令（不可裁）> 显式 user_rule > 其他 user_rule > prompt_patch > skill > workflow。超预算按该顺序裁并报告，禁止静默丢弃，禁止裁当前指令。隐藏 CoT 不得成为资产。同一输入同一 fingerprint。preview 输出 `snapshot` 四槽、去重、scope 泄漏报告。

## 管线

`proposeThenEvaluatePrompt`（`src/internal/learning/pipeline.ts`）连接 detector 与 evaluator，`activationEligible` 恒为 false。skill/workflow 用 `evaluateInducedDraft`。阈值与 successRate 写入 EvidenceBundle。
