import assert from "node:assert/strict";
import test from "node:test";
import { compileGlob } from "./glob-match.js";

test("character classes cannot match directory separators", () => {
  const compiled = compileGlob("src/a[!x]b.ts");
  assert.ok(compiled.ok);
  assert.equal(compiled.matcher.matches("src/acb.ts"), true);
  assert.equal(compiled.matcher.matches("src/a/b.ts"), false);
});

test("brace alternation preserves commas inside character classes", () => {
  const compiled = compileGlob("{[a,b],c}.ts");
  assert.ok(compiled.ok);
  for (const name of ["a.ts", "b.ts", ",.ts", "c.ts"]) {
    assert.equal(compiled.matcher.matches(name), true, name);
  }
  assert.equal(compiled.matcher.matches("d.ts"), false);
});

test("brace delimiters inside a character class remain literal", () => {
  const compiled = compileGlob("{[}],a}.ts");
  assert.ok(compiled.ok);
  assert.equal(compiled.matcher.matches("}.ts"), true);
  assert.equal(compiled.matcher.matches("a.ts"), true);
});
