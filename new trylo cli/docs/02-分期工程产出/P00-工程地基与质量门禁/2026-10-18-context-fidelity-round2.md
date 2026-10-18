# 默认压缩保真与续聊专项，Round 2（2026-10-18）

基线 upstream main：`067b054bcd6fd22690b0e3ae81bf6e721a057693`，已包含合并 PR #2。分支 `codex/context-fidelity-round2`，完全排除学习系统。本轮不更新 PR #2。

## 失败、定位与修复

原 Debuglog04 默认任务保持原四份文件、提示词、7500 人工阈值、4096 显式输出和每组 20 次请求限制。原始失败保留：fact-A-731 写成 fact-A-142 且缺 LF。原 journal/microcompact 仍有事实，第一份旧摘要丢 A/B；路径当时由 assistant 回声偶然保留，不能泛称所有来源均丢失。

当前 main 原样重放一次通过（9 请求），因为模型主动复述 A；这不是修复证据。公开确定性两文件夹具不复述事实，证明两次压缩后 Chat wire 丢中部事实及调用来源。未修复代码 16 项中 6 失败（上下文 4、HTTP 取消 2），10 项为对照通过。

1. 默认工具摘要按行模板频次选至多三条有区别的行，保留原顺序、输出行号和不完整标记，避免固定头部被索引日志占满。逐项 240 / 总计 4000 上限不变；数字仅影响排序，不合并数值不同的行。
2. read_file 摘要保留 path/offset/limit，工具结果保留调用 ID 与真实 outcome。仅白名单惰性读取来源，不复制其他参数或密钥。摘要整体仍先脱敏后有界，不引入另一份任务状态。
3. 历史摘要以 JSON 字符串引用，明确 untrusted data；不是新权限来源。真实 CLI 注入/拒绝测试保证原文件哈希不变，拒绝发既有 warning/失败终态，无伪成功 fileChanges。
4. 实际 HTTP 取消恰好落在片段交付时，旧 reader.cancel 抛 AbortError，使摘要异常退出。现在只过滤与本次信号取消关联的回收错误，始终释放锁，其他错误原样抛出；无 blanket catch。

## 独立验收

原四文件在修复后 8 次真实请求通过：两次压缩的摘要分别携带 A/B、A/B/C/D，结果单次写入，精确 LF 与 SHA-256 `248984c4cc2550887c1cc62adacb064527c1626997a26d0cd6a5af4a3ddda8a0` 一致，新进程准确引用四个值。输入与原失败逐字节哈希一致。公开回归还覆盖同名不同参数并行调用、一个失败、CRLF/无尾换行输入、真实变更元数据和新进程不重复写。

本轮真实 AMD 总计 17/40 请求（main 9、修复 8），每组跨进程统一 20 上限/240s，无 429、无 model 摘要调用。远端 usage 与两进程主 loop 账本相同。7500 不是 AMD 限制，128000 仍仅为原声明。

实际 HTTP/SSE 验证：stop 后迟到 usage 全收再结束、DONE 可结束未关闭 HTTP、无 DONE/EOF 的 stop 仍等待且可取消、无 finish、半截 JSON、断网、正常 EOF、取消及非取消回收异常。保留为了 usage 等待的合同；不新增很短的 idle timeout。model 摘要额外调用继续独立 1024 上限，不计主 loop 次数/输出/usage：本地 2 主请求+1 摘要、max_tokens 50→1024→45 已固定为现状，未偷改预算归属。

本地计时探针另验证 usage 延迟约 100ms 后完整计入；两种挂起观察约 300ms 后取消，回退和关闭均在随后 2ms 内，非服务延迟承诺。上轮真实摘要 59.498s/length(1024) 回退与 8.859s/stop(197) 成功仅标为历史观测；未逐片计时，不能推导无进展间隔。

## 门禁、自审与边界

聚焦 38/38；工具与恢复 78 通过、2 symlink 跳过；完整 verify 11 步全通过（144.32s），38 合同、4187 hermetic 通过、0 失败、6 跳过（4023 顶层名称，嵌套另计）。公开重放：`node --test dist/cmd/trylo/context-evidence.test.js dist/internal/compaction/tool-evidence.test.js dist/internal/e2e/model-summary-http.test.js`。

自审：可读性/可维护性通过；纯摘要策略拥有摘录，prompt-view 仅声明信任边界，HTTP adapter 仅回收自己的 reader。无新依赖、公共字段、journal 迁移、权限放宽或学习接点。核心不依赖 Desktop。

仍有损：非重复长段、超过三条区别行、全局溢出和旧 >20000 字符 microcompact 不保证事实全留，应按已保留来源重新读取；本轮不声称消除所有任务漂移。无默认 idle deadline；摘要预算并入主账需另定产品合同。未新增原生 Desktop/MCP/GLM 真服务验收。回滚本提交即可，旧窗口可读且按新数据边界展示；已写窗口不会重算。详见 [结构化证据](evidence/2026-10-18-context-fidelity-round2.json)。
