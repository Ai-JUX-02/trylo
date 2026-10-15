# WP-C C9 Exit gates 证据

> 本文件是合同证据索引，不是用测试数量代替覆盖。

| Gate | 证据 |
| --- | --- |
| 四域有清晰输入/输出/不负责内容 | `DOMAIN-BOUNDARIES.md`；`STATE.md` 开工卡 |
| `2 次 = proposal，不是 activation` | `prompt.test.ts` `activationEligible === false`；`pipeline.test.ts` |
| 分类有正反例和 ambiguous | `testdata/learning-domains/{positive,negative,ambiguous}`；`hardening.test.ts` |
| generator 不能调用 Board activation | `boundary.test.ts` 无 `activate(` |
| evaluator 与 generator 边界可机器检查 | `ports.ts` + `boundary.test.ts` + `evaluation.test.ts` |
| external verdict 与 model critique 类型分离 | `ExternalVerdict` vs `WeakSignal`；自评 → `no_external_pass` |
| current instruction precedence 与权限隔离 | `user.test.ts`；preview 冲突/裁剪；`appliesToCurrentTask` |
| skill/workflow 含失败经验与 provenance | `skill.test.ts` / `workflow.test.ts`；markdown 正反规则 |
| profile preview 冲突/token/确定性 | `evaluation.test.ts` |
| 无真实 provider/network 和新增依赖 | 未改 `package.json`；`boundary.test.ts` `do not call network`；`io-boundary.test.ts`（import/require/动态 import 的 node:http/https/net/tls、undici、provider SDK、fetch 与跨层依赖机器检查，反例 fixtures `testdata/architecture/forbidden-learning-import-{network,permission}.ts`） |
| 作者审/反方审无 P0/P1 | `QUALITY-AUDIT.md` |
| RUN 按矩阵而非测试数 | `TEST-MATRIX.md` + `RUN.md` |
