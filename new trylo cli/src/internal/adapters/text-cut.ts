/**
 * Cutting text to a byte budget without breaking a character.
 *
 * The implementation now lives in `protocol/text-cut.ts`. It started here, and
 * `loop/tool-execution.ts` grew a second copy (`headWithin` / `tailWithin`)
 * because `loop/**` may not import `adapters/**` — the boundary scan
 * (`verify.mjs:206`) rejects `adapters` by name. Two copies of one rule is the
 * duplication this repository forbids, and nothing kept them in agreement: they
 * matched only because nothing had yet made them differ.
 *
 * `protocol/**` is imported by both layers already, so one copy can serve both.
 * This module stays as a re-export because five call sites import it from here
 * (`tools/read-only/read-file.ts`, `tools/read-only/range.ts`,
 * `project-instructions/appendix.ts`, `tools/mutating/output-limits.ts`, and
 * `loop/tool-execution.ts`); renaming the module under them would be churn with
 * no behaviour change. New code should import the `protocol` path directly.
 */
export { cutToBytes, cutToBytesWithRemainder } from "../protocol/text-cut.js";
