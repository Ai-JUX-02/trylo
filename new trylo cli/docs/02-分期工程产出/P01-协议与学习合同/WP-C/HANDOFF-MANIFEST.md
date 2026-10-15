# WP-C 交付清单（HANDOFF-MANIFEST）

> 日期：2026-09-13  
> 工作树：`C:\work\demo-ws-worktrees\wp-p01-c`（基线 `4c3f565`）  
> 状态：READY_FOR_INTEGRATION_CANDIDATE（见 STATE.md；本包无权写 ACCEPTED/COMPLETE）

## 1. 交付文件

代码（合并时整体加入，勿裁剪单个文件）：

- `src/internal/learning/domains/**` — user / prompt / skill / workflow 四域 + `shared/**` + `dispatch.ts`
- `src/internal/learning/pipeline.ts` — `proposeThenEvaluatePrompt` 单入口组合
- `src/internal/evaluation/**` — evaluator / goodhart / keep-best / profile-preview / ports / 类型与测试
- `testdata/learning-domains/**` — positive / negative / ambiguous fixtures
- `testdata/architecture/forbidden-learning-import-{network,permission}.ts` — C16 机器检查反例
- `docs/02-分期工程产出/P01-协议与学习合同/WP-C/**` — 全部包文档

不交付、不属于本包：Board reducer/store/active pointer、knowledge、journal、Execution Loop、Permission、Tooling、manifest（package.json/package-lock.json/tsconfig.json 均未改）。

## 2. 四域到 Board command 映射

| 域 | 产出 draft | Board command（draft，不写 store） |
| --- | --- | --- |
| user | `UserRuleDraft` / `WithdrawCommandDraft` | `submit_draft` / `submit_withdraw`（`shared/board-command.ts`） |
| prompt | `PromptPatchDraft`（`status=draft`, `activationEligible=false`） | `submit_draft` |
| skill | `SkillDraft`（含 `withdrawSkill`/`editSkill` 新版本） | `submit_draft` / `submit_withdraw` |
| workflow | `WorkflowDraft`（含 `withdrawWorkflow`/`editWorkflow`） | `submit_draft` / `submit_withdraw` |
| evaluation | `EvidenceBundle`（`commandKind: "submit_evidence"`） | `submit_evidence` |

所有 draft 均无 `activate`/`setActive`/`writeBoardState`/`setActivePointer` 方法或键；`assertNoActivation` 与 `io`/`boundary` 测试双重把守。Board 是 lifecycle 唯一 writer（见 INTEGRATION-REQUESTS.md）。

## 3. 公共 / 本地类型边界

- canonical 公共合同（Envelope、Fragment、Journal 等）归 WP-A/WP-B；本包不复制。
- 本包本地类型（`PromptGainEpisode`、`SkillEpisode`、`WorkflowEpisode`、`EvidenceBundle`、`TaskFamily`、`ExternalVerdict`、`WeakSignal`、`BoardCommandDraft`）是领域形状；集成时由 WP-B 做映射，`status` 恒为 `draft`。
- `DRAFT_STATUS`、`FAILURE_CODES`、`ASSET_KINDS` 判别联合是本包合同词汇，不是 Board 状态机。

## 4. 测试证据

- 全量：干净 dist `npm test` 连跑两次，测试名清单 diff 一致（见 RUN.md C16 记录）。
- 矩阵：TEST-MATRIX.md 35+ 行逐场景对应测试文件；不用数量代替覆盖。
- 合同文档：EXIT-GATES.md 12 条各有证据指针；`exit-gates.test.ts` 断言 EXIT-GATES 与 RUN.md 审计范围（含 `src/internal/learning/pipeline.ts`、`EXIT-GATES.md`），文档漏项会真实失败。
- C16 机器检查：`io-boundary.test.ts` — import/require/动态 import 的 node:http/https/net/tls/dns/dgram、undici、provider SDK、`fetch(`、全局 `new WebSocket(`；层级禁依赖 adapters/loop/reducer/permission/desktop/ui/open；`allow_network` 字符串不误报；两个反例 fixture 证明 fail-closed。

## 5. 导入顺序（单向，无环）

```text
shared/**  ←  domains/{user,prompt,skill,workflow}/**
           ←  domains/dispatch.ts
           ←  learning/pipeline.ts → evaluation/{evaluator,keep-best}
evaluation/** → learning/domains/shared/**（仅类型与 hash/board-command 常量）
```

- 四域互不 import（`boundary.test.ts` 机器检查）。
- shared 只含公共机械逻辑：hash、fail-closed parse、privacy、types、forbidden-scan、dual-save、classify（确定性形状分流）、board-command draft。
- pipeline 只组合 proposal→evidence→keep-best，无循环、无持久化、无状态转移。

## 6. 回滚

- 未合并：丢弃本 worktree 即可，主仓零影响（本包从未写 Board/knowledge）。
- 已合并后回滚：删除第 1 节列出的路径 + 对应 docs；无 active pointer 需回滚，因为激活权在 Board 且本包从未触及其 store。

## 7. 风险与已知限制（均非 P0/P1）

1. speech-act/全局短语为显式词表，未见过的说法落 `not_explicit`（宁漏勿错）。
2. 正文扫描刻意不含裸词 `permission`（避免误杀"file permission"类步骤）；权限终裁在 Board+Permission Service。
3. dual-save 只挡完全相同 `identity`（规则文本哈希）；语义相近但字面不同的 skill/workflow 需 Board 去重。
4. profile preview 的 scope 泄漏只挡 `user_global`；project 级过滤需 Board 用 scope id 完成（preview 无 scope id 字段，且不是 snapshot writer）。
5. `package-lock.json` 显示一行 `version` 字段差异：2026-09-12 建工作树时 npm 自动同步产物，非本包编辑，无新依赖。
6. C16 检查覆盖说明符与已知全局 API；`eval`/`new Function` 动态加载不在机器检查内，由代码评审门禁兜底。
