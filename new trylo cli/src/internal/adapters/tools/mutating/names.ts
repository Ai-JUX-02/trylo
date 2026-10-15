export const WRITE_FILE_TOOL = "write_file";
export const EDIT_FILE_TOOL = "edit_file";
export const APPLY_PATCH_TOOL = "apply_patch";
export const RUN_SHELL_TOOL = "run_shell";
// WP13 (L13): cell insert/replace/delete on .ipynb files. A mutating tool, so
// it plans through the sandbox and writes through the shared atomic queue.
export const NOTEBOOK_EDIT_TOOL = "notebook_edit";

export const MUTATING_TOOL_NAMES = [WRITE_FILE_TOOL, EDIT_FILE_TOOL, APPLY_PATCH_TOOL, RUN_SHELL_TOOL, NOTEBOOK_EDIT_TOOL] as const;

export function isMutatingTool(name: string): boolean {
  return (MUTATING_TOOL_NAMES as readonly string[]).includes(name);
}
