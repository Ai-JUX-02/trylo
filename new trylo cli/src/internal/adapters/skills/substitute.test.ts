import assert from "node:assert/strict";
import { test } from "node:test";
import { parseArgumentTokens, substituteArguments } from "./substitute.js";

/**
 * Argument substitution for skill invocation (WP14.1).
 *
 * The contract is the old CLI's `$ARGUMENTS` family, minus the shell-quote
 * dependency: quoted tokens still survive a split, malformed quoting falls back
 * to whitespace, and "no placeholder in the body" appends the arguments rather
 * than losing them.
 */

test("quoted arguments survive tokenisation", () => {
  assert.deepEqual(parseArgumentTokens('foo "hello world" baz'), ["foo", "hello world", "baz"]);
  assert.deepEqual(parseArgumentTokens("foo 'hello world' baz"), ["foo", "hello world", "baz"]);
});

test("malformed quoting falls back to a whitespace split", () => {
  assert.deepEqual(parseArgumentTokens('foo "unclosed bar'), ["foo", '"unclosed', "bar"]);
});

test("$ARGUMENTS is replaced with the full string", () => {
  assert.equal(substituteArguments("run $ARGUMENTS now", "a b", [], true), "run a b now");
});

test("indexed and shorthand placeholders take one token each", () => {
  assert.equal(substituteArguments("$0 then $ARGUMENTS[1] end", "a b c", [], true), "a then b end");
});

test("named placeholders map to positions", () => {
  assert.equal(substituteArguments("use $style and $scope", "dark web", ["style", "scope"], true), "use dark and web");
});

test("a missing named argument substitutes empty instead of leaving the name", () => {
  assert.equal(substituteArguments("use $style", "one", ["style", "scope"], true), "use one");
});

test("no placeholder appends the arguments once", () => {
  assert.equal(substituteArguments("body", "x y", [], true), "body\n\nARGUMENTS: x y");
});

test("undefined arguments leave the content untouched", () => {
  assert.equal(substituteArguments("body with $ARGUMENTS", undefined, [], true), "body with $ARGUMENTS");
});

test("empty string arguments clear placeholders without appending", () => {
  assert.equal(substituteArguments("body $ARGUMENTS", "", [], true), "body ");
});
