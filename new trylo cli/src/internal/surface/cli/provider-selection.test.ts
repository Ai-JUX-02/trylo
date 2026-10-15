import assert from "node:assert/strict";
import test from "node:test";
import type { CliContext } from "./context.js";
import { selectRunProvider } from "./provider-selection.js";

/**
 * D5 P2-2: unknown provider 的 hint 必须同时给两条路。
 *
 * 974e42e 之后 `run --provider <声明id>` 可直用，但 hint 只教 switch。
 * 跑一次挂掉的用户最需要的是"我刚打的那行怎么改"，不是先去 switch。
 */

function ctx(): CliContext {
  return {
    env: {},
    homeDir: "/home/user",
    cwd: "/workspace",
    nodeVersion: "v22.0.0",
    stdinIsTty: false,
    readFile: () => undefined,
    isDirectory: () => true,
    readDir: () => [],
    writeFile: () => true,
    readStdin: async () => "",
    readLine: async () => undefined,
    readSecret: async () => undefined,
    stdout: () => {},
    stderr: () => {},
    now: () => 0,
    newId: (prefix) => `${prefix}-1`,
  };
}

test("D5: an unknown provider hint offers both the direct run and switch", () => {
  const result = selectRunProvider(ctx(), {
    flagProvider: "nosuch",
    endpoint: "https://lab.example/v1",
    model: "lab-7b",
  });
  assert.equal("providerId" in result, false, "expected a failure, not a provider");
  if ("providerId" in result) {
    throw new Error("unreachable");
  }
  assert.match(result.message, /unknown provider nosuch/);
  assert.match(result.hint, /trylo run --provider/);
  assert.match(result.hint, /providers switch/);
});
