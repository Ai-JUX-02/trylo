import assert from "node:assert/strict";
import { test } from "node:test";
import { pathCompletions, type DirEntry } from "./complete.js";

/**
 * Path completion.
 *
 * The load-bearing case is that a completion replaces only the word being
 * typed: the person is mid-sentence, and a Tab that rewrote the rest of the
 * line would be editing their message rather than finishing a path.
 */

const DIRS: Record<string, ReadonlyArray<DirEntry>> = {
  "/ws": [
    { name: "src", isDirectory: true },
    { name: "package.json", isDirectory: false },
    { name: "README.md", isDirectory: false },
  ],
  "/ws/src": [
    { name: "http", isDirectory: true },
    { name: "main.ts", isDirectory: false },
  ],
  "/ws/src/http": [{ name: "retry.ts", isDirectory: false }],
};

const readDir = (absolute: string): ReadonlyArray<DirEntry> =>
  DIRS[absolute.replace(/\/$/, "")] ?? [];

test("a partial name completes to the files that start with it", () => {
  assert.deepEqual(pathCompletions("look at RE", "/ws", readDir), ["README.md"]);
});

test("a directory comes back with its separator so one tab can walk the path", () => {
  assert.deepEqual(pathCompletions("look at s", "/ws", readDir), ["src/"]);
});

test("a path with a directory part completes inside that directory", () => {
  assert.deepEqual(pathCompletions("fix src/ht", "/ws", readDir), ["src/http/"]);
  assert.deepEqual(pathCompletions("fix src/m", "/ws", readDir), ["src/main.ts"]);
});

test("the completion replaces the whole word, not just the tail", () => {
  // `src/re` must give back `src/http/...`, never `http/...`: the caller
  // swaps out the word it found, and a bare tail would be appended to it.
  assert.deepEqual(pathCompletions("fix src/re", "/ws", readDir), []);
  assert.deepEqual(pathCompletions("fix src/http/re", "/ws", readDir), ["src/http/retry.ts"]);
});

test("only the word under the cursor is completed", () => {
  assert.deepEqual(pathCompletions("read RE and tell me", "/ws", readDir), []);
  assert.deepEqual(pathCompletions("read RE", "/ws", readDir), ["README.md"]);
});

test("nothing typed and nothing matching give nothing", () => {
  assert.deepEqual(pathCompletions("", "/ws", readDir), []);
  assert.deepEqual(pathCompletions("read zzz", "/ws", readDir), []);
});

test("a directory that cannot be read completes to nothing rather than throwing", () => {
  assert.deepEqual(pathCompletions("open nope/", "/ws", readDir), []);
});

test("candidates are sorted, so the list does not shuffle between tabs", () => {
  const hits = pathCompletions("p", "/ws", readDir);
  assert.deepEqual([...hits].sort(), hits);
});
