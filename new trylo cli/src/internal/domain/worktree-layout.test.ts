import assert from "node:assert/strict";
import { test } from "node:test";
import {
  hasManagedLayout,
  isManagedBucket,
  isWithin,
  ownerRecordText,
  parseOwnerRecord,
  relativeWithin,
  repositoryNameOf,
  WORKTREE_OWNER_FILENAME,
  WORKTREE_OWNER_VERSION,
} from "./worktree-layout.js";

/**
 * Layout rules, from Codex `codex-rs/worktree/src/lib.rs:363-397` and
 * `paths.rs:26-29`. These are the tests that decide what "ours" means, so
 * each negative case is a worktree we must not touch.
 */

test("a bucket is four hex digits and nothing else", () => {
  assert.equal(isManagedBucket("0a1b"), true);
  assert.equal(isManagedBucket("FFFF"), true);
  assert.equal(isManagedBucket("0a1"), false, "three digits is not a bucket");
  assert.equal(isManagedBucket("0a1bc"), false, "five digits is not a bucket");
  assert.equal(isManagedBucket("0a1g"), false, "g is not a hex digit");
  assert.equal(isManagedBucket(""), false);
});

test("exactly two levels below the pool, first a bucket", () => {
  assert.equal(hasManagedLayout("D:/pool", "D:/pool/0a1b/repo", "win32"), true);
  assert.equal(hasManagedLayout("/pool", "/pool/0a1b/repo", "posix"), true);
  assert.equal(hasManagedLayout("/pool", "/pool/0a1b", "posix"), false, "bucket alone is not a checkout");
  assert.equal(hasManagedLayout("/pool", "/pool/0a1b/repo/nested", "posix"), false, "three levels is not the shape");
  assert.equal(hasManagedLayout("/pool", "/pool/zz1b/repo", "posix"), false, "bucket must be hex");
  assert.equal(hasManagedLayout("/pool", "/other/0a1b/repo", "posix"), false, "outside the pool is not ours");
  assert.equal(hasManagedLayout("/pool", "/pool", "posix"), false, "the pool root itself is not a checkout");
});

test("a directory whose name merely looks like a bucket is not one", () => {
  // `.metadata_never_index` and friends sit at the pool root, one level up,
  // so they must never be mistaken for a checkout we may delete.
  assert.equal(hasManagedLayout("/pool", "/pool/.metadata_never_index", "posix"), false);
});

test("relativeWithin refuses to answer for a path outside", () => {
  assert.equal(relativeWithin("/repo", "/repo", "posix"), "");
  assert.equal(relativeWithin("/repo", "/repo/src", "posix"), "src");
  assert.equal(relativeWithin("/repo", "/elsewhere", "posix"), undefined);
  assert.equal(relativeWithin("/repo", "/repo-other", "posix"), undefined, "a shared prefix is not containment");
  assert.equal(isWithin("/repo", "/repo/src", "posix"), true);
  assert.equal(isWithin("/repo", "/repo-other", "posix"), false);
});

test("windows containment does not confuse drives", () => {
  assert.equal(relativeWithin("D:/pool", "D:/pool/0a1b", "win32"), "0a1b");
  assert.equal(relativeWithin("D:/pool", "E:/pool/0a1b", "win32"), undefined);
});

test("a repository root with no directory name is not namable", () => {
  assert.equal(repositoryNameOf("D:/repo", "win32"), "repo");
  assert.equal(repositoryNameOf("/", "posix"), undefined);
});

test("the ownership record round-trips", () => {
  const text = ownerRecordText("task-7");
  const record = parseOwnerRecord(text);
  assert.deepEqual(record, { version: WORKTREE_OWNER_VERSION, ownerId: "task-7" });
  assert.equal(WORKTREE_OWNER_FILENAME.length > 0, true);
});

test("a record from a newer writer is not read as one we understand", () => {
  assert.equal(parseOwnerRecord('{"version":2,"ownerId":"task-7"}'), undefined);
  assert.equal(parseOwnerRecord('{"ownerId":"task-7"}'), undefined, "no version means no contract");
  assert.equal(parseOwnerRecord('{"version":1,"ownerId":""}'), undefined, "an empty owner answers nothing");
  assert.equal(parseOwnerRecord('{"version":1,"ownerId":"a","extra":1}'), undefined, "deny_unknown_fields");
  assert.equal(parseOwnerRecord("[]"), undefined);
  assert.equal(parseOwnerRecord("not json"), undefined);
});
