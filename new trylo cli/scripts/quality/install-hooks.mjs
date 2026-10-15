import { spawnSync } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

/**
 * Installs the repo-wide `core.hooksPath` pointing at this directory's hook.
 * The hook itself scopes to "new trylo cli/" staged files, so commits that
 * do not touch the CLI pass through in milliseconds. Uninstall with:
 *   git config --unset core.hooksPath
 */

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(here, "..", "..", "..");
const hooksPath = "new trylo cli/scripts/quality/hooks";

const check = spawnSync("git", ["-C", repoRoot, "config", "core.hooksPath", hooksPath], {
  encoding: "utf8",
});
if (check.status !== 0) {
  console.error(check.stderr || "git config failed");
  process.exit(1);
}

const chmod = spawnSync("git", ["-C", repoRoot, "update-index", "--chmod=+x", `${hooksPath}/pre-commit`], {
  encoding: "utf8",
});
if (chmod.status !== 0) {
  // Not tracked yet on a fresh clone — chmod the file directly instead.
  spawnSync("chmod", ["+x", join(repoRoot, hooksPath, "pre-commit")]);
}

console.log(`core.hooksPath = ${hooksPath} (pre-commit active for "new trylo cli/" commits)`);
