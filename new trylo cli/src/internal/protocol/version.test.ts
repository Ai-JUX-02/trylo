import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";
import { TRYLO_VERSION } from "./version.js";

/**
 * The version canary.
 *
 * `TRYLO_VERSION` is a literal so that `adapters/**` can use it without reading
 * files; the price of that is drift, and this test is the guard. Three sites
 * report the CLI's version — `trylo version`, and the client info of both MCP
 * transports — and all three import this one constant, so matching the package
 * here is what keeps `--version` from describing a build nobody made.
 */

test("the CLI version is the package version", () => {
  const pkg = JSON.parse(readFileSync(join(process.cwd(), "package.json"), "utf8")) as {
    readonly version: string;
  };
  assert.equal(TRYLO_VERSION, pkg.version);
});

test("the version is a real pre-release number, not a placeholder", () => {
  // `0.0.0` is what an unversioned package says; shipping it would make every
  // `--version` and every MCP handshake describe a package that does not exist.
  assert.notEqual(TRYLO_VERSION, "0.0.0");
  assert.match(TRYLO_VERSION, /^\d+\.\d+\.\d+$/);
});
