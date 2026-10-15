import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from "node:fs";
import os from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { EXIT_CODES } from "../../protocol/cli-stream.js";
import { parseWorkflow } from "./args-workflow.js";
import { handleWorkflowList, handleWorkflowRun, handleWorkflowShow } from "./commands-workflow.js";
import type { CliContext } from "./context.js";
import type { CliSink } from "./render.js";

/**
 * Workflow regression (WP24.2 / A08).
 *
 * Discovery is real files; `run` executes through the ordinary run
 * pipeline with the offline fixture provider, so the test proves a
 * workflow produces a genuine turn result without a second executor.
 * The new-behavior red proof (unknown `workflow` command before this
 * package) is recorded in `evidence/2026-10-06-WP24/wp24-red-examples.md`.
 */

function workspace(files: Readonly<Record<string, string>>): { readonly dir: string; readonly cleanup: () => void } {
  const dir = mkdtempSync(join(os.tmpdir(), "trylo-wf-"));
  for (const [relative, text] of Object.entries(files)) {
    const absolute = join(dir, relative);
    mkdirSync(join(absolute, ".."), { recursive: true });
    writeFileSync(absolute, text);
  }
  return { dir, cleanup: () => rmSync(dir, { recursive: true, force: true }) };
}

function ctxFor(dir: string): { readonly ctx: CliContext; readonly sink: CliSink; readonly out: string[]; readonly err: string[] } {
  const out: string[] = [];
  const err: string[] = [];
  const readFile = (path: string): string | undefined => {
    try {
      return readFileSync(path, "utf8");
    } catch {
      return undefined;
    }
  };
  const ctx: CliContext = {
    env: { TRYLO_HOME: join(dir, "home") },
    homeDir: dir,
    cwd: dir,
    nodeVersion: "v20.0.0",
    platform: "linux",
    stdinIsTty: false,
    readFile,
    isDirectory: () => true,
    readDir: (absolutePath: string) => {
      try {
        return readdirSync(absolutePath).map((name) => {
          let bytes = 0;
          let modifiedAtMs = 0;
          try {
            const info = statSync(join(absolutePath, name));
            bytes = info.size;
            modifiedAtMs = info.mtimeMs;
          } catch {
            // Vanished between listing and stat: unsized, still listed.
          }
          return { name, bytes, modifiedAtMs };
        });
      } catch {
        return [];
      }
    },
    writeFile: () => true,
    readStdin: async () => "",
    readLine: async () => undefined,
    readSecret: async () => undefined,
    stdout: (text) => out.push(text),
    stderr: (text) => err.push(text),
    now: () => 0,
    newId: (prefix) => `${prefix}-test`,
  };
  return { ctx, sink: { stdout: (text: string) => out.push(text), stderr: (text: string) => err.push(text) }, out, err };
}

test("list names project workflows and show prints the prompt", () => {
  const ws = workspace({ ".trylo/workflows/deploy.md": "---\ndescription: Ship it\n---\n\nRun the checks.\n" });
  try {
    const fx = ctxFor(ws.dir);
    assert.equal(handleWorkflowList(fx.ctx, { json: false }), EXIT_CODES.OK);
    assert.match(fx.out.join(""), /deploy/);
    const shown = ctxFor(ws.dir);
    assert.equal(handleWorkflowShow(shown.ctx, { name: "deploy", json: false }), EXIT_CODES.OK);
    assert.match(shown.out.join(""), /Run the checks/);
  } finally {
    ws.cleanup();
  }
});

test("show of a missing workflow refuses with CONFIG, not an empty page", () => {
  const ws = workspace({});
  try {
    const fx = ctxFor(ws.dir);
    assert.equal(handleWorkflowShow(fx.ctx, { name: "nosuch", json: false }), EXIT_CODES.CONFIG);
    assert.equal(fx.out.join(""), "");
  } finally {
    ws.cleanup();
  }
});

test("run executes the workflow body as the run prompt on the fixture provider", async () => {
  const ws = workspace({ ".trylo/workflows/hello.md": "Say hello.\n" });
  try {
    const fx = ctxFor(ws.dir);
    const code = await handleWorkflowRun(
      fx.ctx,
      { name: "hello", run: { message: [], readStdin: false, provider: "fixture" } },
      fx.sink,
    );
    assert.equal(code, EXIT_CODES.OK);
    // The fixture provider's scripted answer: the point is the workflow body
    // drove a genuine turn through the ordinary pipeline (exit 0 plus model
    // text), not that the fixture echoes the prompt.
    assert.match(fx.out.join(""), /The package name is/);
  } finally {
    ws.cleanup();
  }
});

test("the parser owns run flags after -- and refuses them before it", () => {
  const ok = parseWorkflow(["run", "deploy", "--", "--provider", "fixture"]);
  assert.equal(ok.kind, "workflow_run");
  if (ok.kind === "workflow_run") {
    assert.equal(ok.options.name, "deploy");
    assert.equal(ok.options.run.provider, "fixture");
  }
  assert.equal(parseWorkflow(["run", "deploy", "--json"]).kind, "error");
  assert.equal(parseWorkflow(["run", "../escape"]).kind, "error");
  assert.equal(parseWorkflow(["bogus"]).kind, "error");
});
