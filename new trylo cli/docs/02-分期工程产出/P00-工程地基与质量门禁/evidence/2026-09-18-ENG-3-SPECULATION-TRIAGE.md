# ENG-3 证据记录：全仓五态投机代码分诊与可达性基线

- **日期**：2026-09-18（R4 重算修订）
- **依据方案**：`2026-09-18-方案-新Trylo-CLI代码质量与工程化优化.md`（§3.3、§5.2、§8 ENG-3）
- **基线 Commit**：`0d569a3ec23ac940ed48161356d9aa45244abea1`（`feat/trylo-alpha`）
- **测试守门**：`src/internal/e2e/speculation-triage.test.ts`（8/8 自动化用例通过）
- **分诊模块**：`src/internal/e2e/speculation-triage.ts`
- **可达性脚本**：`scripts/quality/reachability.mjs`（BFS 从 `src/cmd/trylo/main.ts` 起，静态 import 图）

---

## 1. 五态分诊总揽 (Taxonomy Overview)

由 `scripts/quality/reachability.mjs` 脚本化计算（非手工维护），从唯一 CLI 入口 `src/cmd/trylo/main.ts` 做 BFS 静态 import 可达性分析。全仓 497 个非测试生产 TypeScript 源码文件实现 **100% 静态分类**，未分类文件为 **0**：

| 分类状态 (State) | 文件数 (Files) | 占比 (Ratio) | 核心定义与处置说明 |
| :--- | :--- | :--- | :--- |
| **`production_reachable`** | 319 | 64.2% | 从 `main.ts` 经 BFS 静态 import 图直接可达（含 CLI 组合根、Agent Loop、领域状态机、已接线适配器、MCP 运行时、子代理基础设施、学习方法模块） |
| **`library_reachable`** | 14 | 2.8% | 纯合同、协议编解码器与端口定义 (`internal/contract/**`, `internal/protocol/**`, `internal/ports/**`)，具备完备的导出面和权威合同测试，被 production 和 deferred 模块共同消费 |
| **`test_support`** | 19 | 3.8% | 纯测试双模、Mock 服务器、回归 Harness 与 E2E 基础设施 (`internal/e2e/`, `internal/journal/`, `fakes.ts`, `scenarios.ts`, `memory-*-store.ts`)，严禁导出至生产入口 |
| **`approved_deferred`** | 145 | 29.2% | 已获架构批准但受控延期接入的在跑包（拥有明确 Owner、消费者、接入里程碑与退出条件） |
| **`remove`** | 0 | 0.0% | 无主的孤立结构性冗余（当前全仓为 0，严禁盲目删除在跑包代码） |
| **总计** | **497** | **100%** | **0 未分类文件，0 游离文件** |

### 与旧版差异说明

旧版手工统计报 187 production_reachable / 275 approved_deferred / 496 总计。差异根因：

1. **手工计数遗漏**：旧版未做完整 BFS，仅从 wiring.ts 层手工枚举，漏计了深层传递可达的适配器与运行时模块。
2. **已通电模块未改判**：`internal/adapters/mcp-*`（27 文件）、`internal/subagent/`（9 文件）、`internal/learning/method/`（12 文件）在 wiring.ts 中已有真实构造与接线，但旧版仍标为 deferred。
3. **文件总数 +1**：新增 `reachability.mjs` 相关辅助或后续施工新增文件。

**重算命令**：`node scripts/quality/reachability.mjs --json` → `dist/reachability.json`

---

## 2. 已通电模块改判记录 (R4)

以下模块经静态 import 图验证为从 `main.ts` 真实可达，从 `approved_deferred` 改判为 `production_reachable`：

| 模块前缀 | 文件数 | 改判依据 |
| :--- | :--- | :--- |
| `internal/adapters/mcp-*` | 27 | `wiring.ts` 构造 MCP 运行时池，`host.ts` 接线 stdio/HTTP 客户端 |
| `internal/subagent/` | 9 | `wiring.ts:273` 真构造 SubAgent runtime |
| `internal/learning/method/` | 12 | `--learning` CLI flag 已接入 method board |

---

## 3. 延期接入包权威登记表 (Approved Deferred Packages)

依据 §3.3 退出标准，所有标为 `approved_deferred` 的模块必须明确其责任人、消费者、目标里程碑和归宿条件：

| 模块前缀 / 路径 | 领域能力 | 所有者 (Owner) | 主要消费者 (Consumer) | 目标里程碑 | 退出 / 接入条件 | 隔离与保护措施 |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| `internal/learning/` (除 method/) | 双循环学习引擎 | Agent Learning / L01 | Dual-loop Controller | L01 | 经 L01 独立外审后接入 runner | 生产 CLI 默认钉死 `NO_LEARNING_PROFILE` |
| `internal/integration/` | 学习与工具集成运行时 | Learning & Extensibility | Learning & Tool Service | L01 & P03 | 方法抽取与习惯偏好完备后挂载 | 受跑包写入集保护，禁止主线直接侵入 |
| `internal/adapters/learning-store/` | 学习事件账本持久化 | Storage / L01 | Learning Controller | L01 | 双循环持久化开启时接入 | 仅在独立测试与评估中作为存储驱动 |
| `internal/adapters/permission-store/` | 权限授权文件账本 | Security / P03 | Approval Policy Engine | P03 | 永久授权模式点亮时接入 CLI host | 当前使用进程内内存权限计划器 |
| `internal/adapters/verification-authority-store/` | 签名与信任权限库 | Governance / P03 | Tooling Trust Verifier | P03 | 加密签名包分发时接入 | 单元测试内做权威校验，主路径隔离 |
| `internal/tooling/` | 工具发现、隔离与生命周期 | Extensibility / P03 | Tool Manager CLI | P03 | 隔离沙箱审计完成后挂载 | 隔离区强制限制与只读搜索隔离 |
| `internal/adapters/tool-acquisition/` | 工具网络抓取与校验 | Extensibility / P03 | Acquisition Vetting | P03 | `trylo tool add` 启用时接入 | 网络请求受白名单限制，当前离线封闭 |
| `internal/mcp/` (协议层，非 adapters) | MCP 协议定义与网关 | Integrations / P07 | MCP Host Integration | P07 | MCP 配置管理激活后启用连接池 | 当前 CLI 命令面拒绝未经网关的远程传输 |
| `internal/evaluation/` | 运行结果质量评估 | Evaluation / P05 | Experience Evaluator | P05 | 轮次后遥测与打分开启时接入 | 纯评估算法，不向外部泄露副作用 |
| `internal/knowledge/` | 知识库与 RAG 适配 | Knowledge / P06 | Retrieval Port | P06 | 检索增强批准后挂载至 prompt | 纯数据结构，无未经授权的文件访问 |
| `internal/surface/protocol/` | ACP / AG-UI 协议帧表面 | Protocols / P08 | Desktop & Web Frontend | P08 | 桌面 UI 联调时对接 WebSocket 流 | 独立传输层，不污染 CLI stdout/stderr |
| `internal/surface/cli/tui/` | 全屏交互式终端 UI | CLI / P08 | Interactive Mode | P08 | 在 P08 里程碑替代 Readline REPL | 当前使用精简终端 Readline 驱动交互 |
| `internal/loop/recover,reorder,replay` | 循环恢复与重放 | Core Loop / P04 | Runner recovery path | P04 | 断点续跑与重放调试启用时接入 | 当前 runner 不使用恢复路径 |
| `internal/config/layers.ts` | 多层配置合并 | Config / P04 | Settings resolver | P04 | 配置分层 UI 暴露时接入 | 当前使用单层配置 |

---

## 4. 守门测试与自动化验证证据 (Test Evidence)

在 `src/internal/e2e/speculation-triage.test.ts` 中固化了 8 项自动化断言：

```text
✔ W3 去投机分诊：NO_LEARNING_PROFILE 严格隔离激活层与控制板
✔ W3 去投机分诊：ToolRunnerPort 标记为 OPEN，不提前在主仓铺桩
✔ W3 去投机分诊：生产 CLI wiring 不得直接导入学习总控制板
✔ W3 去投机分诊：在跑包写入集完整性保护（不得误删）
✔ ENG-3 五态分诊：全仓 100% 生产 TypeScript 源码已纳入五态分类，0 孤立未分诊文件
✔ ENG-3 五态分诊：每个 approved_deferred 模块具备明确的所有者、消费者、目标里程碑和归宿
✔ ENG-3 五态分诊：library_reachable 纯模块具备完备的导出面和合同测试
✔ ENG-3 五态分诊：test_support 设施严格隔离，绝不暴露在主 CLI 导出面
ℹ tests 8 / pass 8 / fail 0
```

全仓质量门禁 `npm run verify` 中包含该测试，确保任何新增未经分诊的代码文件或越界引入均会导致构建与门禁即刻报红。

---

## 5. 重算验证命令

```bash
# 生成完整可达性数据
node scripts/quality/reachability.mjs --json

# 输出摘要
node scripts/quality/reachability.mjs

# 验证守门测试
npx tsc -p tsconfig.json && node --test dist/internal/e2e/speculation-triage.test.js
```
