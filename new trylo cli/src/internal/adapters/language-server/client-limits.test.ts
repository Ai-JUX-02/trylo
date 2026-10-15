import assert from "node:assert/strict";
import { describe, it } from "node:test";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createLanguageServer } from "./client.js";
import type { LspProcessDeps } from "./client.js";

/**
 * The lifecycle half, against servers that actually speak (WP12 L60).
 *
 * Policy ceilings (truncation, oversize refusal, idle reap) live in the
 * `withQueryLimits` decorator and are proven against stubs in
 * `lsp-limits.test.ts`. What stays here is what only a real process can
 * prove: a stubborn server is killed rather than orphaned, and a message
 * that declares more than the cap settles the pending caller as over-limit
 * instead of hanging it. The server is `node -e` inline: a real stdio peer
 * with no fixture file to drift.
 */

function workspaceRoot(): string {
  // A language server is spawned with the workspace as its cwd, so the root
  // has to exist: the first version of these tests used a fictional "D:/w"
  // and every spawn died with ENOENT before a single byte moved.
  return fs.mkdtempSync(path.join(os.tmpdir(), "trylo-lsp-test-"));
}

function fakeServer(): string {
  return `
const { stdin, stdout, env } = process;
let buffer = Buffer.alloc(0);
function frame(value) {
  const body = Buffer.from(JSON.stringify(value), "utf8");
  stdout.write(Buffer.concat([Buffer.from("Content-Length: " + body.length + "\\r\\n\\r\\n", "utf8"), body]));
}
function killerFrame() {
  // Declares far more than any cap while sending almost nothing: the guard
  // must fire on the declaration, before the body is allocated.
  stdout.write(Buffer.from("Content-Length: 268435456\\r\\n\\r\\n{}", "utf8"));
}
stdin.on("data", (chunk) => {
  buffer = Buffer.concat([buffer, chunk]);
  for (;;) {
    const end = buffer.indexOf("\\r\\n\\r\\n");
    if (end < 0) return;
    const headers = buffer.subarray(0, end).toString("utf8");
    const match = /content-length:\\s*(\\d+)/i.exec(headers);
    if (!match) return;
    const length = Number(match[1]);
    if (buffer.length < end + 4 + length) return;
    const body = buffer.subarray(end + 4, end + 4 + length).toString("utf8");
    buffer = buffer.subarray(end + 4 + length);
    let message;
    try { message = JSON.parse(body); } catch { continue; }
    if (message.method === "initialize") {
      frame({ jsonrpc: "2.0", id: message.id, result: { capabilities: { hoverProvider: true } } });
    } else if (message.method === "shutdown") {
      if (env.IGNORE_EXIT !== "1") frame({ jsonrpc: "2.0", id: message.id, result: null });
    } else if (message.method === "textDocument/hover") {
      if (env.KILLER === "1") { killerFrame(); }
      else frame({ jsonrpc: "2.0", id: message.id, result: { contents: "hello" } });
    } else if (message.method === "exit") {
      if (env.IGNORE_EXIT !== "1") process.exit(0);
    }
  }
});
setInterval(() => {}, 1000);
`;
}

function deps(): LspProcessDeps {
  return {
    authorize: async () => ({ ok: true }),
    // A child with no SYSTEMROOT fails the spawn itself on Windows; the
    // production wiring passes the real host environment for the same reason.
    hostEnv: { SYSTEMROOT: process.env.SYSTEMROOT ?? "", PATH: process.env.PATH ?? "" },
    log: () => undefined,
  };
}

const signal = new AbortController().signal;

describe("client lifecycle against a speaking server", () => {
  it("close() returns even when the server ignores the exit notification", async () => {
    const server = createLanguageServer({
      spec: {
        serverName: "stubborn",
        workspaceRoot: workspaceRoot(),
        command: process.execPath,
        args: ["-e", fakeServer()],
        env: { IGNORE_EXIT: "1" },
      },
      deps: deps(),
      stopGraceMs: 200,
    });
    try {
      assert.deepEqual(await server.ensureStarted(), { ok: true });
      const startedAt = Date.now();
      await server.close();
      // Grace 200ms plus slack: a close that waited forever would blow this.
      assert.equal(Date.now() - startedAt < 5000, true);
      assert.equal(server.isRunning(), false);
    } finally {
      await server.close();
    }
  });

  it("an oversize declaration settles the pending caller as over-limit", async () => {
    const server = createLanguageServer({
      spec: {
        serverName: "killer",
        workspaceRoot: workspaceRoot(),
        command: process.execPath,
        args: ["-e", fakeServer()],
        env: { KILLER: "1" },
      },
      limits: { requestTimeoutMs: 10_000, maxConcurrentRequests: 8, maxMessageBytes: 1024, maxLocationsPerAnswer: 200, maxServers: 4, idleTtlMs: 300_000 },
      deps: deps(),
      stopGraceMs: 500,
    });
    try {
      assert.deepEqual(await server.ensureStarted(), { ok: true });
      const result = await server.query({ operation: "hover", path: "src/a.ts", line: 0, character: 0 }, signal);
      assert.equal(result.ok, false);
      if (result.ok) return;
      // Over-limit, not dead: the failure names the bound that fired.
      assert.equal(result.code, "lsp_limit_exceeded");
    } finally {
      await server.close();
    }
  });
});
