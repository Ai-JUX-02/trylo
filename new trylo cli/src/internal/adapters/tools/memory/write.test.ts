import assert from "node:assert/strict";
import { test } from "node:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { createMemoryWriteTools, MEMORY_REMEMBER_TOOL, MEMORY_WRITE_TOOL_NAMES } from "./write.js";
import { createFileFactStore } from "../../../integration/user-learning/facts-file.js";
import { createUserMemoryService } from "../../../integration/user-learning/memory-service.js";

/**
 * WP-CL / B：工具层的成功语义。
 *
 * 关键不是"能调用"，而是**失败不能长得像成功**：关闭、未落地、写失败都必须
 * 返回 error outcome，模型才没有机会在下一句说"记好了"。
 */

const USER_TEXT = "我是 YL Z，Trylo 的开发者，请记住";

function service(switchValue = "user") {
  const root = mkdtempSync(path.join(tmpdir(), "wpcl-tool-"));
  return {
    root,
    port: createUserMemoryService({
      store: createFileFactStore(root), userId: "local-user", workspaceId: "ws-a",
      now: () => 1_760_000_000_000, switchValue,
      turn: { sessionId: "s1", turnId: "t1", userText: USER_TEXT, userEventId: "s1:t1:user" },
    }),
  };
}

test("the write catalog exposes remember, versioned correction and retraction", () => {
  const { root, port } = service();
  try {
    const expected = [MEMORY_REMEMBER_TOOL, "memory_forget", "memory_correct"].sort();
    assert.deepEqual([...MEMORY_WRITE_TOOL_NAMES].sort(), expected);
    assert.deepEqual(createMemoryWriteTools(port).snapshot().map((binding) => binding.name).sort(), expected);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("a grounded remember returns a result outcome carrying the receipt", async () => {
  const { root, port } = service();
  try {
    const outcome = await createMemoryWriteTools(port).execute({
      toolCallId: "call-1", name: MEMORY_REMEMBER_TOOL,
      arguments: { subject: "YL Z", statement: USER_TEXT, fact_kind: "identity_fact", scope: "user" },
    }, new AbortController().signal);
    assert.equal(outcome.outcome, "result");
    assert.match(outcome.outcome === "result" ? outcome.output : "", /已保存到 Trylo 用户记忆/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("a disabled switch is an error outcome, never a save", async () => {
  const { root, port } = service("");
  try {
    const outcome = await createMemoryWriteTools(port).execute({
      toolCallId: "call-2", name: MEMORY_REMEMBER_TOOL,
      arguments: { subject: "YL Z", statement: USER_TEXT, fact_kind: "identity_fact", scope: "user" },
    }, new AbortController().signal);
    assert.equal(outcome.outcome, "error");
    assert.equal(outcome.outcome === "error" ? outcome.code : "", "memory_disabled");
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("an ungrounded statement is refused with a named code", async () => {
  const { root, port } = service();
  try {
    const outcome = await createMemoryWriteTools(port).execute({
      toolCallId: "call-3", name: MEMORY_REMEMBER_TOOL,
      arguments: { subject: "YL Z", statement: "以后都叫我老板", fact_kind: "preference", scope: "user" },
    }, new AbortController().signal);
    assert.equal(outcome.outcome, "error");
    assert.equal(outcome.outcome === "error" ? outcome.code : "", "memory_rejected:statement_not_grounded");
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("missing arguments are invalid, not a silent no-op", async () => {
  const { root, port } = service();
  try {
    const outcome = await createMemoryWriteTools(port).execute({
      toolCallId: "call-4", name: MEMORY_REMEMBER_TOOL, arguments: { subject: "YL Z" },
    }, new AbortController().signal);
    assert.equal(outcome.outcome, "error");
    assert.equal(outcome.outcome === "error" ? outcome.code : "", "invalid_arguments");
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
