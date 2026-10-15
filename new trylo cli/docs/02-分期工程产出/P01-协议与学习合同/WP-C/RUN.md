# WP-P01-C RUN

> 日期：2026-09-12  
> 工作树：`C:\work\demo-ws-worktrees\wp-p01-c`  
> 基线提交：`4c3f56554b717dd194d3a7daee60ad8941eeaec2`  
> Node v24.14.1 / npm 11.11.0 / TypeScript 5.8.3  
> `$trylo-code-quality` SHA256 `E2342D39B6506ED7C126987B3E50BF9D5215D514B3665B84759C5BF512A3D9AF`

## 环境隔离

未写入 `C:\work\demo-ws\new trylo cli`。与 WP-A（`C:\work\demo-ws-worktrees\wp-p01-a`）物理目录分离。独立 `node_modules` / `dist`。

## 命令与退出码

### 1. 本包最窄测试

```
npx tsc -p tsconfig.json
node --test "./dist/internal/learning/**/*.test.js" "./dist/internal/evaluation/**/*.test.js"
```

退出码：0

### 2. 全量 `npm test`（干净 dist 连跑两次）

```
Remove-Item -LiteralPath dist -Recurse -Force
npm test
```

C8-FIX 后干净 dist 连跑两次：

1. 退出码 0，tests 88 pass / 0 fail / 0 skipped，duration_ms 702.1577
2. 退出码 0，tests 88 pass / 0 fail / 0 skipped，duration_ms 638.6383

清单数量一致，不依赖陈旧 dist。

C10-HARDEN 后再跑两次：

1. 退出码 0，tests 96 pass / 0 fail / 0 skipped，duration_ms 628.989
2. 退出码 0，tests 96 pass / 0 fail / 0 skipped，duration_ms 1037.9579

C11-HARDEN 后再跑两次：

1. 退出码 0，tests 100 pass / 0 fail / 0 skipped，duration_ms 894.1787
2. 退出码 0，tests 100 pass / 0 fail / 0 skipped，duration_ms 643.7462

C12-HARDEN 后再跑两次：

1. 退出码 0，tests 103 pass / 0 fail / 0 skipped，duration_ms 674.9044
2. 退出码 0，tests 103 pass / 0 fail / 0 skipped，duration_ms 641.1627

C13-HARDEN 后再跑两次：

1. 退出码 0，tests 106 pass / 0 fail / 0 skipped，duration_ms 505.3452
2. 退出码 0，tests 106 pass / 0 fail / 0 skipped，duration_ms 545.4447

C14-HARDEN 后再跑两次：

1. 退出码 0，tests 108 pass / 0 fail / 0 skipped，duration_ms 615.221
2. 退出码 0，tests 108 pass / 0 fail / 0 skipped，duration_ms 627.2026

C15-AUDIT 后再跑两次：

1. 退出码 0，tests 109 pass / 0 fail / 0 skipped，duration_ms 955.6044
2. 退出码 0，tests 109 pass / 0 fail / 0 skipped，duration_ms 734.7726

C9 证据：`EXIT-GATES.md`。本包不写 Board active。未声称外部验收。

无真实 provider/network。无新增依赖。

## 审计范围（C16 机器检查）

机器检查入口：`src/internal/learning/io-boundary.test.ts`。覆盖以下生产代码路径，任何一条出现 provider/network IO 或跨层依赖即测试失败：

- `src/internal/learning/**` 全部生产 `.ts`，明确包含 `src/internal/learning/pipeline.ts`；
- `src/internal/evaluation/**` 全部生产 `.ts`；
- 检查内容：`import`/`require`/动态 `import()` 的 `node:http`、`node:https`、`node:net`、`node:tls`（含 `node:dns`/`node:dgram` 与裸名形式）、`undici`、provider SDK（openai、@openai、anthropic、@anthropic-ai、@google/generative-ai、@azure/openai、ollama、mistralai、cohere、@aws-sdk 前缀），以及生产代码中的 `fetch(` 直接调用与全局 `new WebSocket(` 构造（Node 22+ 无需 import）；按模块说明符解析，不用粗暴子串匹配，`allow_network` 等领域字符串不误报；
- 层级边界：learning 与 evaluation 不得 import provider adapter（`adapters`）、Execution reducer（`loop`/`reducer`）、Permission 实现（`permission`）、Desktop/UI/open（`desktop`/`ui`/`open`）；
- 反例 fixtures：`testdata/architecture/forbidden-learning-import-network.ts`、`testdata/architecture/forbidden-learning-import-permission.ts`（证明检测器 fail-closed）；
- 文档合同：`docs/02-分期工程产出/P01-协议与学习合同/WP-C/EXIT-GATES.md` 与本 RUN.md 审计范围由 `exit-gates.test.ts` 校验，文档漏项会真实失败。

## Diff 范围（本包允许路径）

- `src/internal/learning/domains/**`
- `src/internal/learning/pipeline.ts`
- `src/internal/evaluation/**`
- `testdata/learning-domains/**`
- `docs/02-分期工程产出/P01-协议与学习合同/WP-C/**`（含 `EXIT-GATES.md`）

未改：Control Board、knowledge、journal、loop、protocol、permission、tooling、package.json、package-lock.json、tsconfig.json、AGENTS.md。

## 许可证

无新生产/开发/可选依赖。传递闭包仍为 typescript 5.8.3 + @types/node。未从 `open/` 复制源码。

## 风险与回滚

风险：speech-act 短语表会漏掉未见过的自然语言；这会落入 `not_explicit`，宁可漏不可把一次抱怨写成 global。Board 映射未接线，draft 不会自己生效。

回滚：丢弃本 worktree，或合并后删除上述路径。无 active pointer 可回滚，因为从未写入。

## 禁止的伪完成项检查

- 无 TODO 代替必填字段
- 无 mock 充当外部 pass
- 不以测试数量代替矩阵覆盖（见 TEST-MATRIX.md 逐行）
- 无“后续再接入”代替 detector/evaluator 行为

## C16 收口运行记录（2026-09-13）

环境：Node v24.18.0（本工作树 shell 实测）。

1. 最窄检查：`npx tsc -p tsconfig.json` → 0；
   `node --test "./dist/internal/learning/io-boundary.test.js" "./dist/internal/evaluation/exit-gates.test.js" "./dist/internal/evaluation/boundary.test.js"` → 0（11 pass / 0 fail）。
2. 反例实验 A：临时生产文件 import `node:http` → io-boundary 1 fail 并点名该文件；临时删除。
3. 反例实验 B：临时从本节下方「审计范围」移除 pipeline.ts 路径字符串 → exit-gates 新增用例 1 fail；已恢复。
4. 反方审补强：全局 `new WebSocket(` 无需 import 即可联网，初版漏检 → 已加入检测与 fixture 行。
5. 清理 `dist` 后 `npm test` 连跑两次：
   - 第 1 次退出码 0，tests 116 pass / 0 fail / 0 skipped，duration_ms 955.0451
   - 第 2 次退出码 0，tests 116 pass / 0 fail / 0 skipped，duration_ms 1030.1369
   - 两次测试名清单逐行 diff 一致；且与 `src/**/*.test.ts` 中 `test(` 定义总数 116 相符。
6. `git diff --check` → 退出码 0，无空白错误。
7. 对账：排除 `io-boundary.test.js` 与 `exit-gates.test.js` 后其余 `node --test` 为 109 pass / 0 fail；两文件合计 7 用例（io-boundary 5 个全新 + exit-gates 2 个 = 1 既有 + 1 新增），116 总数闭合。STATE 中 C15 的「109」口径与本条 109（不含两文件）不能直接互推，不再追改。

已知产物：`package-lock.json` 一行 `version` 字段差异系 2026-09-12 建工作树时 npm 自动同步，非本包编辑，无新依赖。
