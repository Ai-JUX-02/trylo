# WP-C 质量审计（作者审 + 反方审）

> 技能：`$trylo-code-quality` SHA256 `E2342D39B6506ED7C126987B3E50BF9D5215D514B3665B84759C5BF512A3D9AF`  
> 审查顺序：可读性/维护性 → 架构 → 正确性 → 安全/权限/隐私 → 并发/恢复 → 性能 → 许可证 → 测试/文档  
> 轮次：C14 文档与管线对齐。实现合同已齐。

## 作者审

### 1 可读性 / 维护性

四域与 evaluator 分目录。判别联合表达失败/draft/compound/shadow。`parse.ts` 把外部 JSON 一次转成领域值。`mutableFields` 与 mutation 入口分离。

已知限制（非 P0/P1）：speech-act 用显式短语，未见过的说法落 `not_explicit`。

### 2 架构

不写 Board store / active pointer；generator 不 import evaluator；evaluator 不 induce。compound_proposal_suggestion 不是两个资产双写。

### 3 正确性

C8 矩阵、C7 攻击、C8-FIX 缺口（checkSchema、正文偷带、fail-closed、措辞路由、merge/reject、mutation、Goodhart 多指标、replay/负例、渲染序）均有测试。

### 4 安全 / 权限 / 隐私

无 capability。正文扫描 skip_approval/tool_switch/download，避免把单词 “permission” 误杀合法步骤。用户原文不入库。

### 5 并发 / 恢复

无持久化 writer。畸形 JSON / 缺字段 fail-closed，不抛成草稿。

### 6 性能 / 预算

preview 裁剪报告；当前指令不可裁；来源标记稳定序。

### 7 许可证

无新依赖。

### 8 证据

见 TEST-MATRIX.md 与 RUN.md。不以测试数量代替矩阵行。

## 反方审（本轮实际击穿并已修）

| 攻击 | 初轮缺口 | 修复 |
| --- | --- | --- |
| 只改 checkKind / checkSchema 仍归因 | 未比较命令族 | task-family.ts + 测试 |
| patch ops 正文带 skip_approval | 只扫 extraClaims | forbiddenClaimsInOps |
| 一句措辞当 skill | 仅 skill 失败 | 路由 prompt_patch strongCandidate=false |
| 双存 | 只返回 failure | compound_proposal_suggestion |
| workflow 改 nodes | 无 mutation 闸 | applyWorkflowMutation |
| 自生成锚混进 EvidenceBundle.externalAnchors | 原样拷贝 | independentAnchors |
| 只优化成功、cost/latency 爆炸 | 未看多指标 | multiMetricBlocked → reject |
| 畸形 JSON 抛异常 | 无 parse | parseJsonValue fail-closed |
| 空壳 ambiguous fixture | 未加载 | 真实 episodes JSON |
| 正文扫 “permission” 误杀 | 过宽 | scanForbiddenBody |

C7 原攻击集仍全绿。未能证明 generator 能 activate。未能证明两次成功会变成 active。

## C16 收口审计轮（2026-09-13）

### 作者审

按固定顺序重查：可读性/维护性 → 架构 → 正确性 → 安全 → 并发 → 性能 → 许可证 → 证据。四域输入/输出/不负责内容与 DOMAIN-BOUNDARIES.md 逐条对上；attribution 硬规则（1 次=insufficient_evidence、2 次=proposal 且 `activationEligible:false`、model/tool/code/workflow 任一同时变化=insufficient_attribution、同 conversationId 拒绝）在 `attribution.ts` 与测试中一致；pipeline 只组合 detect→evaluate→keepBest，无 Board lifecycle 复制；shared 仅公共机械逻辑；TEST-MATRIX 第 30 行证据指针已从实现文件改指真实测试。

### 反方审（本轮击穿并修复）

| 攻击 | 缺口 | 处置 |
| --- | --- | --- |
| 绕过 fetch/import 检查做真实网络 IO | Node 22+ 全局 `new WebSocket(` 不需要 import，C16 初版漏检 | `io-boundary.test.ts` 增加 websocket 检测 + fixture 行 |
| 文档声称覆盖但实现漏项 | RUN.md 审计范围此前无测试把守 | `exit-gates.test.ts` 断言 RUN.md 含 pipeline.ts 与 EXIT-GATES.md，实验证明删项即红 |
| 机器检查粗暴误报 | 生产码含 `allow_network`/`curl http` 领域字符串 | 检查按模块说明符解析；专测证明不误报 |

### 残余风险（P2，非阻断，已入 HANDOFF-MANIFEST §7）

- 正文扫描刻意不含裸词 `permission`（防误杀）；dual-save 仅挡相同 identity；preview 的 project 级 scope 过滤留给 Board；`eval`/`new Function` 动态加载靠评审门禁。

## 结论

可读性门禁通过。无剩余 P0/P1。C9 证据见 `EXIT-GATES.md`；交付映射、类型边界、导入顺序、回滚见 `HANDOFF-MANIFEST.md`。
