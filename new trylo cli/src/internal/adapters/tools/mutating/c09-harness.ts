import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import type { ToolOutcome, ToolSandbox } from "../../../ports/tools.js";
import { createWorkspaceSandbox } from "../../sandbox/index.js";
import { createMutatingTools } from "./index.js";
import { RUN_SHELL_TOOL } from "./names.js";
import { createNodeSpawner, type ShellSpawner } from "./shell-spawn.js";

/**
 * The shared rig for the two real-process suites beside this file.
 *
 * Both need the same three things, and each is a measured constraint rather
 * than a convenience — so they live here once, with the reasons, instead of
 * being restated (and eventually misremembered) in each file.
 *
 *  1. The program is `node` by BARE NAME, so the sandbox's own PATH resolution
 *     finds it. Naming node by absolute path is refused with
 *     `path_outside_workspace` before anything spawns, because the shipped
 *     sandbox sets `allowAbsoluteExecutable: false`. That refusal is correct and
 *     it is the reason the obvious version of these tests cannot be written.
 *  2. The script under test is a FILE, not an inline `-e` string. A `.cmd`
 *     launcher forwards `%*` through cmd's own argument handling, which eats the
 *     inner quotes of a `JSON.stringify(...)` — measured: a bare identifier
 *     arrived unquoted and node threw a ReferenceError. That is a property of
 *     batch files, not of this spawner, and a file keeps the evidence about the
 *     thing under test.
 *  3. Nothing here touches `process.env`. Putting the workspace on `PATH` would
 *     have been the first way I wrote this, and it is the wrong one twice over:
 *     a leaked `PATH` would make a later test pass by finding a program this rig
 *     planted, and a helper that mutates the ambient environment is exactly what
 *     the static ambient scan refuses. The scripts are named RELATIVE to the
 *     working directory instead, which is also the arrangement a real caller
 *     has — the cwd is the workspace.
 */

export const SIGNAL = new AbortController().signal;

/** The program both suites run, as the sandbox has to see it: a bare name. */
export const NODE = "node";

/** A fresh workspace holding whatever scripts a case needs. */
export function workspace(scripts: Readonly<Record<string, string>> = {}): string {
  const root = mkdtempSync(path.join(os.tmpdir(), "trylo-c09-"));
  for (const [name, body] of Object.entries(scripts)) {
    writeFileSync(path.join(root, name), body, "utf8");
  }
  return root;
}

/** A bare temporary directory, for cases that plant their own program. */
export function bareWorkspace(): string {
  return mkdtempSync(path.join(os.tmpdir(), "trylo-c09-"));
}

export function cleanup(root: string): void {
  rmSync(root, { recursive: true, force: true });
}

/** Run `command` in `root`, as a project runs its own tools. */
export async function run(
  root: string,
  command: string,
  options: Readonly<Record<string, unknown>> = {},
): Promise<ToolOutcome> {
  return await runWith(createWorkspaceSandbox({ workspaceRoot: root }), createNodeSpawner(), command, options);
}

/** As {@link run}, but with a caller-supplied sandbox and spawner. */
export async function runWith(
  sandbox: ToolSandbox,
  spawner: ShellSpawner,
  command: string,
  options: Readonly<Record<string, unknown>> = {},
): Promise<ToolOutcome> {
  const tools = createMutatingTools({ sandbox, spawner });
  return await tools.execute(
    { toolCallId: "c", name: RUN_SHELL_TOOL, arguments: { command, timeoutMs: 30_000, ...options } },
    SIGNAL,
  );
}

export function stdoutOf(outcome: ToolOutcome): string {
  return outcome.outcome === "result" && typeof outcome.value.stdout === "string" ? outcome.value.stdout : "";
}

export function stderrOf(outcome: ToolOutcome): string {
  return outcome.outcome === "result" && typeof outcome.value.stderr === "string" ? outcome.value.stderr : "";
}
