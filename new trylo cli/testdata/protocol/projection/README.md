# testdata/protocol/projection

投影层（`src/internal/surface/protocol/**`）的夹具。

## 契约

- `envelopes.json`：**27 条**原始 envelope，`EVENT_KINDS` 全量各一条，一条不多不少。
  每条形如 `{ "kind": <EventKind>, "envelope": <原始 envelope> }`。
- 这里放的是**未投影的原始 JSON**（不是 `Envelope` 类型实例），因为投影的第一步
  就是把未知输入送进 `parseEnvelope`。测试只通过 `surface/protocol/admit.ts` 进场，
  不允许测试自己拼 `AdmittedEnvelope`。
- 夹具里的 payload 形状都抄自真实生产点（`domain/reduce.ts` 的 `emit`、
  `domain/reduce-helpers.ts` 的 `terminate`/`cancelNow`、`loop/runner.ts`），
  不是为了让投影好看而编的。没有生产点的 kind（如 `subagent_spawn`、
  `file_write`、`model_fallback`）按 `protocol/payload-contract.ts` 声明的可选字段填写，
  并在测试里明确标注「尚无生产点」。
- **夹具不承载脱敏用例**：secret / 绝对路径一类只能出现在测试内联构造的 envelope 里，
  这样夹具文件本身可以随便给外部审计看，不会看起来像泄露。
- 夹具不需要保持 `sequence` 连续：`Envelope.sequence` 是 per-attempt 数列，
  与传输层的全局序号是两件事（见 `ports/transport.ts`）。
