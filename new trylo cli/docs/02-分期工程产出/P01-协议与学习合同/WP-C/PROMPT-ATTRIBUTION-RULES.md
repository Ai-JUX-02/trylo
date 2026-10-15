# Prompt 因果归因规则

> 状态：待审  
> 实现：`src/internal/learning/domains/prompt/`

## 要回答的问题

两次独立对话里，用户改了提示词，工程结果都变好。怎么办？

记录，而且要快于“等任务结束再泛化 memory”。但记录对象是高价值 **proposal**，不是 active 资产。

## 可比较 task family

同时满足才可比较：

1. `intentClass` 相同
2. `checkKind` 相同（unit_test / compile / lint / acceptance）
3. 双方都声明时 `language`、`repoKind` 相同
4. 不同 `conversationId`

否则 `insufficient_attribution`，不得把结果差归功于 prompt。

## 归因只承认 prompt-only delta

必须记录：

- baseline prompt hash
- candidate patch（结构化 ops，不是两份大文本）
- task family
- model / toolset / codeBaseline / workflow 版本
- 两组 causal observation refs
- external result
- expected benefit
- regression risks
- privacy / provenance（不存用户原文）

任一混杂（model、toolset、codeBaseline、workflow）→ `insufficient_attribution`。

## 阈值

配置化，默认固定语义：

`2 次可比较、方向一致、有外部 outcome/verdict = 可以提案，不等于可以启用。`

- 一次成功 → `insufficient_evidence`
- 方向不一致 → `insufficient_evidence`
- 同一对话两次观察 → `insufficient_evidence`
- 自生成测试 / LLM 自评 → 不能锚定

Detector 不晋升。`activationEligible` 恒为 false。

## 弱信号（不可产生强候选或 external pass）

LLM 自称更好、输出更长、token/step 更多、用户不再投诉、生成器自写测试全绿、`completed` 无 verifier。
