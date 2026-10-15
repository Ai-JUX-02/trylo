import assert from "node:assert/strict";
import { test } from "node:test";
import { parseArgs } from "./args.js";

/**
 * Root dispatch stays a one-line delegation (WP26收敛).
 *
 * The root recognises the word and hands `rest.slice(1)` to the family parser;
 * it never re-parses flags itself and never reaches into `argv` past the global
 * prelude. `config` is the same shape: one `parseConfig` call, not inline
 * flag handling. Families (`schedule`, `daemon`, `bg`) keep their delegation
 * as `{ kind: "family", word, args }` so the root never learns a schedule id.
 *
 * Red evidence: fault injection (pass the command word itself into the family
 * parser, e.g. `parseConfig(rest)` without slicing) turns every case below
 * red — `config show` becomes `config requires the show subcommand` and each
 * direct-write family reports its own usage error. The behaviour is unchanged
 * by the hygiene fix, so the pre-fix run is green; the injected fault proves
 * the test is not vacuous. See the 2026-10-08施工记录.
 */

test("config delegates to the config parser with args past its own word", () => {
  assert.deepEqual(parseArgs(["config", "show"]), {
    kind: "config_show",
    json: false,
  });
  assert.deepEqual(parseArgs(["config", "show", "--json"]), {
    kind: "config_show",
    json: true,
  });
  assert.equal(parseArgs(["config"]).kind, "error");
  assert.equal(parseArgs(["config", "bogus"]).kind, "error");
});

test("direct-write families still parse after the rest.slice(1) convergence", () => {
  assert.equal(
    parseArgs(["login", "--provider", "fixture"]).kind,
    "login",
  );
  assert.equal(parseArgs(["status", "--json"]).kind, "auth_status");
  assert.equal(parseArgs(["auth", "list"]).kind, "auth_list");
  assert.equal(parseArgs(["mcp", "list"]).kind, "mcp_list");
  assert.equal(parseArgs(["completion", "bash"]).kind, "completion");
  assert.equal(parseArgs(["checkpoint", "list"]).kind, "checkpoint_list");
});

test("family words keep their delegation and never learn subcommand shapes", () => {
  for (const word of ["schedule", "daemon", "bg"] as const) {
    const parsed = parseArgs([word, "list"]);
    assert.equal(parsed.kind, "family");
    if (parsed.kind !== "family") continue;
    assert.equal(parsed.word, word);
    assert.deepEqual(parsed.args, ["list"]);
  }
});

test("a global switch is still refused before config or a family sees it", () => {
  assert.equal(parseArgs(["--learning=method", "config", "show"]).kind, "error");
  assert.equal(parseArgs(["--learning", "method", "schedule", "list"]).kind, "error");
});
