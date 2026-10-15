/**
 * Workflow discovery (WP24.2 / A08).
 *
 * The old CLI gates its workflow machinery behind `WORKFLOW_SCRIPTS` and
 * the implementation files are absent from the mirror (only
 * `src/tools/WorkflowTool/constants.ts`, the name constant, remains), so
 * there is no old execution engine to reuse — recorded as source_missing
 * in the WP24 actual-revalidation table. What the old side does have is
 * the markdown discovery shape (`workflows` in `CLAUDE_CONFIG_DIRECTORIES`),
 * and that shape is byte-for-byte the output-style shape: one file, one
 * name, frontmatter plus a prompt body.
 *
 * The repo rule for a repeated judgment vocabulary is one shared module,
 * so this file reuses `output-styles.ts` as the single markdown-file
 * parser instead of writing a second one. The difference between a style
 * and a workflow is consumption, not shape: a style appends to the system
 * seeds, a workflow becomes the run's prompt through the existing run
 * pipeline (no new executor, no new permission facts).
 */

import {
  findOutputStyle,
  loadOutputStyles,
  type OutputStyle,
  type StyleIo,
} from "./output-styles.js";

/** A workflow is a named markdown prompt; the alias keeps one canonical shape. */
export type Workflow = OutputStyle;

export type WorkflowDirs = {
  readonly projectDir: string;
  readonly userDir: string;
};

export function loadWorkflows(io: StyleIo, dirs: WorkflowDirs): ReadonlyArray<Workflow> {
  return loadOutputStyles(io, dirs);
}

export function findWorkflow(workflows: ReadonlyArray<Workflow>, name: string): Workflow | undefined {
  return findOutputStyle(workflows, name);
}
