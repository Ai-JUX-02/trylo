/**
 * 工具学习的组合层（P05 工具学习 TP-1）。
 *
 * 目录边界与理由，同型于 `integration/user-learning/`：
 *
 *  - `my-tools-view.ts` —— 「我的工具」的来源与优化标识，从既有读模型**派生**。
 *  - `contribution-prompt.ts` —— 贡献助手的固定提示词（零 LLM）。
 *  - `awareness-runtime.ts` —— 意识层的运行时：攒一拍一拍的事实、判、记、说。
 *  - `ledger-file.ts` —— 本地追加账（`node:fs` **只允许出现在这里**，同
 *    `learning/io-boundary.test.ts` 的纪律；组合层是「学习层不碰 IO」的落点）。
 *
 * 学习层（`learning/**`）不知道 `node:fs`、不知道 `--learning`、不知道执行环的
 * envelope 长什么样；它只提供纯函数与端口形状。上面每一条「知道」都落在本目录，
 * 也就是落在**组合层**。
 */

export {
  actionKey,
  createToolGapRuntime,
  instruction,
  toolOf,
  type ToolGapRuntime,
  type ToolLearningHost,
} from "./awareness-runtime.js";
export {
  LEDGER_TAIL_RECORDS,
  TOOL_LEDGER_FILE,
  createFileToolLedger,
  proposalHistoryOf,
  type ToolLedgerPort,
  type ToolLedgerRecord,
} from "./ledger-file.js";
export { CONTRIBUTION_PLACEHOLDER, contributionPrompt, type ContributionContext } from "./contribution-prompt.js";
export {
  createFileRefinementStore,
  REFINEMENT_STORE_FILE,
} from "./overlay-file.js";
export {
  REFINE_TASK_NAME,
  REFINE_TASK_TIMEOUT_MS,
  createRefineRuntime,
  type RefineAttemptInput,
  type RefineOutcome,
  type RefineRuntime,
  type RefineRuntimeHost,
} from "./refine-runtime.js";
export {
  builtinViewOf,
  myToolsView,
  sourceOf,
  viewOf,
  type MyToolView,
  type ToolSource,
} from "./my-tools-view.js";
