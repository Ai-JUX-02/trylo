import assert from "node:assert/strict";
import { test } from "node:test";
import { diffLines } from "./diff-view.js";

/**
 * WP23.1 (L43): a unified diff inside tool output is rendered with the row
 * numbers a diff viewer owes the person — where in the file each change sits.
 * Anything that is not a diff is declined so the caller's fallback stays.
 */

test("a unified diff gains a gutter with old and new row numbers", () => {
  const lines = diffLines(
    ["--- a/src/a.ts", "+++ b/src/a.ts", "@@ -1,2 +1,2 @@", "-old", "+new", " ctx"].join("\n"),
  );
  assert.deepEqual(
    lines?.map((line) => [line.tone, line.text]),
    [
      ["output", "--- a/src/a.ts"],
      ["output", "+++ b/src/a.ts"],
      ["tool", "@@ -1,2 +1,2 @@"],
      ["removed", "   1 old"],
      ["added", "   1 new"],
      ["output", "   2 ctx"],
    ],
  );
});

test("row counters advance across rows and hunk headers reset them", () => {
  const lines = diffLines("@@ -10,3 +10,4 @@\n- a\n+ b\n+ c\n  d");
  assert.deepEqual(
    lines?.map((line) => line.text),
    ["@@ -10,3 +10,4 @@", "  10  a", "  10  b", "  11  c", "  12  d"],
  );
});

test("plain output is declined so the heuristic keeps it", () => {
  assert.equal(diffLines("just tool output\nmore lines"), undefined);
});

test("plus and minus rows without a hunk header are not a diff", () => {
  assert.equal(diffLines("- item one\n- item two"), undefined);
});

test("a diff with only context rows is declined", () => {
  assert.equal(diffLines("@@ -1,2 +1,2 @@\n a\n b"), undefined);
});
