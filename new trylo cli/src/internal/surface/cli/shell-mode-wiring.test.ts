import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { readShellSetting, resolveShellMode } from "../../adapters/sandbox/shell-mode.js";
import type { ShellEnvironment } from "../../adapters/sandbox/shell-detect.js";
import { shellModeFor } from "./shell-mode-wiring.js";

function surface(overrides: Partial<ShellEnvironment> = {}): ShellEnvironment {
  return {
    platform: "win32",
    env: {},
    fileExists: () => false,
    ...overrides,
  };
}

/**
 * Resolving the run's shell once, at the turn boundary (WP05 C06/C07).
 *
 * The roles precedent applies: discovery freezes for the turn, and a missing
 * file takes effect on the next run with nothing to clear. An absent setting
 * is the shipped direct path, never a resolved-then-ignored shell.
 */
describe("shellModeFor", () => {
  it("absent means direct, without touching detection", () => {
    const result = shellModeFor(undefined, surface());
    assert.equal(result.ok, true);
    if (!result.ok) return;
    assert.equal(result.mode.kind, "none");
  });

  it("a named shell resolves against the injected surface", () => {
    // Everything exists: the first install location wins without the test
    // depending on path separators or forecasted directories.
    const result = shellModeFor("cmd", surface({ fileExists: () => true }));
    assert.equal(result.ok, true);
    if (!result.ok) return;
    assert.equal(result.mode.kind, "shell");
  });

  it("a missing shell fails named, never substituted", () => {
    const result = shellModeFor("zsh", surface());
    assert.equal(result.ok, false);
    if (result.ok) return;
    assert.equal(result.code, "shell_not_installed");
  });

  it("a non-shell value is refused, not defaulted", () => {
    for (const bad of ["", "powershell.exe", 1, true]) {
      const result = shellModeFor(bad, surface());
      assert.equal(result.ok, false, `${JSON.stringify(bad)} was accepted`);
    }
  });

  it("agrees with the two-stage contract", () => {
    // readShellSetting answers "was one asked for"; resolveShellMode answers
    // "which one". This wiring must not collapse the two, or absent would
    // resolve the platform shell and every flag-off run would change.
    assert.equal(readShellSetting(undefined), undefined);
    const resolved = resolveShellMode(surface({ fileExists: () => true }), "cmd");
    assert.equal(resolved.ok, true);
  });
});
