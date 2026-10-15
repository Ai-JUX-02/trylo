import assert from "node:assert/strict";
import { readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";
import test from "node:test";

const ROOT = path.join(process.cwd(), "src", "internal");

function walk(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    const full = path.join(dir, entry);
    if (statSync(full).isDirectory()) {
      out.push(...walk(full));
    } else if (full.endsWith(".ts") && full.endsWith(".test.ts") === false) {
      out.push(full);
    }
  }
  return out;
}

test("domain generators do not import evaluator pass or board activation", () => {
  const files = walk(path.join(ROOT, "learning", "domains"));
  assert.equal(files.length > 0, true);
  for (const file of files) {
    const source = readFileSync(file, "utf8");
    assert.equal(source.includes("from \"../../evaluation"), false, file);
    assert.equal(/\bsetActivePointer\s*\(/.test(source), false, file);
    assert.equal(/\bwriteBoardState\s*\(/.test(source), false, file);
    assert.equal(/\bactivate\s*\(/.test(source), false, file);
  }
});

test("user/prompt/skill/workflow domains do not import sibling domains", () => {
  const domains = ["user", "prompt", "skill", "workflow"];
  for (const domain of domains) {
    const files = walk(path.join(ROOT, "learning", "domains", domain));
    for (const file of files) {
      const source = readFileSync(file, "utf8");
      for (const other of domains) {
        if (other === domain) {
          continue;
        }
        assert.equal(
          source.includes(`from "../${other}/`),
          false,
          `${file} imports sibling domain ${other}`,
        );
      }
    }
  }
});

test("learning and evaluation production sources do not call network", () => {
  const files = [
    ...walk(path.join(ROOT, "learning")),
    ...walk(path.join(ROOT, "evaluation")),
  ];
  assert.equal(files.length > 0, true);
  for (const file of files) {
    const source = readFileSync(file, "utf8");
    assert.equal(/from ["']node:(http|https|net|dns)["']/.test(source), false, file);
    assert.equal(/\bfetch\s*\(/.test(source), false, file);
    assert.equal(/from ["']undici["']/.test(source), false, file);
  }
});

test("evaluator does not propose or induce assets", () => {
  const files = walk(path.join(ROOT, "evaluation"));
  for (const file of files) {
    const source = readFileSync(file, "utf8");
    assert.equal(source.includes("induceSkill"), false, file);
    assert.equal(source.includes("induceWorkflow"), false, file);
    assert.equal(source.includes("detectPromptPatch"), false, file);
    assert.equal(source.includes("buildUserRule"), false, file);
    assert.equal(/\bactivate\s*\(/.test(source), false, file);
    assert.equal(/\bsetActivePointer\s*\(/.test(source), false, file);
    assert.equal(/\bactivate\s*\(/.test(source), false, file);
  }
});
