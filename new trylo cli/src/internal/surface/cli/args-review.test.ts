import assert from "node:assert/strict";
import { test } from "node:test";
import { parseArgs } from "./args.js";

/**
 * WP11: `diff`, `review`, `checkpoint diff` and `session review` parsing.
 *
 * Red evidence: the new commands did not parse before WP11 (`unknown
 * command` / `unknown checkpoint subcommand`). The conflict case below pins
 * the `--turn`/`--message` exclusion the handler relies on.
 */

test("diff parses with and without --json", () => {
  assert.deepEqual(parseArgs(["diff"]), { kind: "diff", options: { json: false } });
  assert.deepEqual(parseArgs(["diff", "--json"]), { kind: "diff", options: { json: true } });
  assert.equal(parseArgs(["diff", "extra"]).kind, "error");
});

test("review parses each target shape", () => {
  assert.deepEqual(parseArgs(["review", "--uncommitted"]), {
    kind: "review",
    options: { uncommitted: true, json: false },
  });
  assert.deepEqual(parseArgs(["review", "--base", "main", "--json"]), {
    kind: "review",
    options: { uncommitted: false, base: "main", json: true },
  });
  assert.deepEqual(parseArgs(["review", "--commit", "abc", "--title", "T"]), {
    kind: "review",
    options: { uncommitted: false, commit: "abc", commitTitle: "T", json: false },
  });
  assert.deepEqual(parseArgs(["review", "check auth"]), {
    kind: "review",
    options: { uncommitted: false, prompt: "check auth", json: false },
  });
  assert.deepEqual(parseArgs(["review", "-"]), {
    kind: "review",
    options: { uncommitted: false, promptFromStdin: true, json: false },
  });
  assert.equal(parseArgs(["review", "--nope"]).kind, "error");
});

test("checkpoint diff requires an id", () => {
  assert.deepEqual(parseArgs(["checkpoint", "diff", "cp-1"]), {
    kind: "checkpoint_diff",
    options: { checkpointId: "cp-1", json: false },
  });
  assert.equal(parseArgs(["checkpoint", "diff"]).kind, "error");
  assert.equal(parseArgs(["checkpoint", "diff", "cp-1", "--json"]).kind, "checkpoint_diff");
});

test("checkpoint restore scopes with repeatable --only", () => {
  assert.deepEqual(parseArgs(["checkpoint", "restore", "cp-1", "--only", "a.ts", "--only", "b.ts"]), {
    kind: "checkpoint_restore",
    options: { checkpointId: "cp-1", only: ["a.ts", "b.ts"], json: false },
  });
  assert.deepEqual(parseArgs(["checkpoint", "restore", "cp-1", "--only=b.ts", "--json"]), {
    kind: "checkpoint_restore",
    options: { checkpointId: "cp-1", only: ["b.ts"], json: true },
  });
  assert.deepEqual(parseArgs(["checkpoint", "restore", "cp-1"]), {
    kind: "checkpoint_restore",
    options: { checkpointId: "cp-1", json: false },
  });
  assert.equal(parseArgs(["checkpoint", "restore", "cp-1", "--only"]).kind, "error");
  assert.equal(parseArgs(["checkpoint", "restore", "cp-1", "--bogus"]).kind, "error");
});

test("session review parses turn, message and horizon selectors", () => {
  assert.deepEqual(parseArgs(["session", "review", "s1"]), {
    kind: "session_review",
    options: { session: "s1", json: false },
  });
  assert.deepEqual(parseArgs(["session", "review", "s1", "--message", "2", "--json"]), {
    kind: "session_review",
    options: { session: "s1", message: 2, json: true },
  });
  assert.deepEqual(parseArgs(["session", "review", "s1", "--turn", "t9", "--as-of-sequence", "4"]), {
    kind: "session_review",
    options: { session: "s1", turn: "t9", asOfSequence: 4, json: false },
  });
  assert.equal(parseArgs(["session", "review", "s1", "--turn", "t", "--message", "1"]).kind, "error");
  assert.equal(parseArgs(["session", "review", "s1", "--message", "0"]).kind, "error");
  assert.equal(parseArgs(["session", "review", "s1", "--message", "x"]).kind, "error");
});
