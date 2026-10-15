// Trylo Work — read-only step-contract guard.
//
// Regression guard for a REAL production failure:
//
//   User: "你帮我读一下变色小魔术最新的那个PPT，给一点修改建议，不是让你修改，
//          先和我交流"
//   Result: Task failed — "mutation-required contract unmet",
//           contractReason = step_requires_artifact_mutation
//
// The user asked for analysis and a discussion, not a file edit. The contract
// layer does have a downgrade path for that (hasReadOnlyConstraint →
// analysis_only / advisory), but detectReadOnlyConstraint() only matched
// ENGLISH phrasings ("do not edit files", "without modifying"), so the Chinese
// constraint was invisible and the step was still held to a strict
// "must mutate files" contract it could never satisfy.
//
// These tests lock the fix in two ways:
//   1. the Chinese vocabulary must exist in the vendor source (so an upstream
//      vendor refresh cannot silently drop it again);
//   2. the COMPILED daemon must actually recognise it and downgrade the
//      contract (so the shipped runtime is covered, not just the source).

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);

const SOURCE_REL = 'src/electron/agent/executor-completion-utils.ts';
const DIST_REL = 'dist/daemon/electron/agent/executor-completion-utils.js';
const STEP_CONTRACT_REL = 'dist/daemon/electron/agent/step-contract.js';

function vendorPath(rel: string): string {
  return fileURLToPath(new URL(`../vendor/cowork-os/${rel}`, import.meta.url));
}

const ZH_POSITIVES = [
  '你帮我读一下变色小魔术最新的那个PPT，给一点修改建议，不是让你修改，先和我交流',
  '请分析这份PPT，不要修改文件',
  '只读分析这个PPT，不要改动',
  '读一下PPT，先和我交流，先不要改',
  '帮我看看这份教案，给点建议就行，不用改',
  '不要生成文件，直接告诉我结论',
];

/** Genuine mutation requests — must NEVER be classified read-only, otherwise
 *  real work would silently stop producing files. */
const MUTATION_NEGATIVES = [
  '帮我修改这份PPT并保存到 .trylo/out/',
  'create a new spreadsheet from this data',
  '把这个教案重写一遍',
];

describe('vendor contract: Chinese read-only constraint', () => {
  it('keeps the Chinese constraint vocabulary in the vendor source', () => {
    const source = readFileSync(vendorPath(SOURCE_REL), 'utf8');
    assert.match(
      source,
      /ZH_READ_ONLY_CONSTRAINT_PATTERNS/,
      'the Chinese pattern table was removed from detectReadOnlyConstraint()',
    );
    // Spot-check that the negations themselves survived an upstream refresh.
    for (const phrase of ['不要', '不是(?:让|要|叫)?你?', '只读', '无需']) {
      assert.match(
        source,
        new RegExp(phrase),
        `Chinese read-only vocabulary "${phrase}" is missing`,
      );
    }
  });

  it('compiled daemon detects Chinese read-only intent', () => {
    const dist = vendorPath(DIST_REL);
    if (!existsSync(dist)) return; // daemon not built in this checkout
    const { detectReadOnlyConstraint } = require(dist);
    assert.equal(typeof detectReadOnlyConstraint, 'function');

    for (const text of ZH_POSITIVES) {
      assert.equal(detectReadOnlyConstraint(text), true, `should be read-only: ${text}`);
    }
    // English support must not regress either.
    assert.equal(detectReadOnlyConstraint('review the deck, do not edit files'), true);
  });

  it('does NOT swallow genuine mutation requests', () => {
    const dist = vendorPath(DIST_REL);
    if (!existsSync(dist)) return;
    const { detectReadOnlyConstraint } = require(dist);
    for (const text of MUTATION_NEGATIVES) {
      assert.equal(detectReadOnlyConstraint(text), false, `must stay mutating: ${text}`);
    }
  });

  it('read-only constraint downgrades mutation_required to analysis_only', () => {
    const dist = vendorPath(DIST_REL);
    const stepContractDist = vendorPath(STEP_CONTRACT_REL);
    if (!existsSync(dist) || !existsSync(stepContractDist)) return;

    const { detectReadOnlyConstraint } = require(dist);
    const { deriveStepContractMode } = require(stepContractDist);

    const prompt =
      '你帮我读一下变色小魔术最新的那个PPT，给一点修改建议，不是让你修改，先和我交流';
    const hasReadOnlyConstraint = detectReadOnlyConstraint(prompt);
    assert.equal(hasReadOnlyConstraint, true);

    // A step that would otherwise demand a file mutation (it touches a .pptx)
    // must be relaxed once the constraint is recognised.
    const base = {
      description: 'Read the PPT and suggest revisions',
      requiresMutation: true,
      requiresArtifactEvidence: true,
      requiresWriteByArtifactMode: true,
    };
    const downgraded = deriveStepContractMode({ ...base, hasReadOnlyConstraint: true });
    const strict = deriveStepContractMode({ ...base, hasReadOnlyConstraint: false });

    assert.equal(downgraded.mode, 'analysis_only');
    assert.equal(downgraded.enforcementLevel, 'advisory');
    assert.equal(strict.mode, 'mutation_required');
    assert.equal(strict.contractReason, 'step_requires_artifact_mutation');
  });
});
