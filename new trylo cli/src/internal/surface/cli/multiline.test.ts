import assert from "node:assert/strict";
import { test } from "node:test";
import { readMultiLine } from "./multiline.js";

/**
 * Multi-line input: a trailing backslash joins the next line.
 *
 * The subtle cases are the escaped backslash (`\\` asks for a literal
 * backslash, not a continuation) and EOF in the middle of a continuation
 * (the person pressed Enter; the text submits with the backslash dropped
 * rather than being lost).
 */

test("a plain line is returned as-is", async () => {
  assert.equal(await readMultiLine(async () => "hello"), "hello");
});

// The queue form is clearer than juggling indices in one closure.
function feed(lines: ReadonlyArray<string>): () => Promise<string | undefined> {
  const queue = [...lines];
  return async () => queue.shift();
}

test("a trailing backslash joins the next line with a newline", async () => {
  assert.equal(await readMultiLine(feed(["first \\", "second"])), "first \nsecond");
});

test("two continuations join three lines", async () => {
  assert.equal(
    await readMultiLine(feed(["a \\", "b \\", "c"])),
    "a \nb \nc",
  );
});

test("a double backslash is a literal backslash, not a continuation", async () => {
  assert.equal(await readMultiLine(feed(["path ends in \\\\", "next"])), "path ends in \\\\");
});

test("eof in the middle of a continuation still submits, backslash dropped", async () => {
  assert.equal(await readMultiLine(feed(["unfinished \\"])), "unfinished ");
});

test("eof with no input at all is still eof", async () => {
  assert.equal(await readMultiLine(feed([])), undefined);
});
