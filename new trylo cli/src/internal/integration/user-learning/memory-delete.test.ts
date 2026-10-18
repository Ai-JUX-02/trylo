import assert from "node:assert/strict";
import { test } from "node:test";
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { deleteUserMemory } from "./memory-delete.js";
import { createFileFactStore, USER_FACTS_FILE } from "./facts-file.js";
import { USER_LEDGER_FILE } from "./ledger-file.js";

/**
 * WP-CL / B20：删除全部用户学习数据。
 *
 * 三件事必须同时成立：该删的删了、删完读不到、重复删不报错。第一条错了是隐私
 * 事故，第二条错了是"显示已删除但还在"，第三条错了会让人不敢再点。
 */

function rootWithFiles(): string {
  const root = mkdtempSync(path.join(tmpdir(), "wpcl-delete-"));
  writeFileSync(path.join(root, USER_FACTS_FILE), `${JSON.stringify({ record: "user_fact" })}\n`);
  writeFileSync(path.join(root, USER_LEDGER_FILE), "");
  return root;
}

test("deletes the facts and ledger files, and they are really gone", () => {
  const root = rootWithFiles();
  try {
    const result = deleteUserMemory(root);
    assert.equal(result.ok, true);
    assert.deepEqual(result.ok ? [...result.removed].sort() : [], [USER_FACTS_FILE, USER_LEDGER_FILE].sort());
    assert.equal(existsSync(path.join(root, USER_FACTS_FILE)), false);
    assert.equal(existsSync(path.join(root, USER_LEDGER_FILE)), false);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("is idempotent: a second delete reports what was already absent", () => {
  const root = rootWithFiles();
  try {
    assert.equal(deleteUserMemory(root).ok, true);
    const again = deleteUserMemory(root);
    assert.equal(again.ok, true);
    assert.deepEqual(again.ok ? again.removed : ["x"], []);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("leaves a non-empty directory alone instead of wiping it", () => {
  // Another owner may keep records here. This function deletes the three files
  // it knows by name; it must never become a recursive delete.
  const root = rootWithFiles();
  try {
    mkdirSync(path.join(root, "someone-else"));
    writeFileSync(path.join(root, "someone-else", "keep.txt"), "keep");
    assert.equal(deleteUserMemory(root).ok, true);
    assert.equal(existsSync(path.join(root, "someone-else", "keep.txt")), true);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("after deletion the store reads as empty, not as unreadable", () => {
  const root = rootWithFiles();
  try {
    deleteUserMemory(root);
    const read = createFileFactStore(root).read();
    assert.equal(read.ok, true);
    assert.deepEqual(read.ok ? read.records : ["x"], []);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
