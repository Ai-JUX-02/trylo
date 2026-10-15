import path from "node:path";

/** Only the literal root is an alias for '.', never another absolute target.
 * Reject dot components before normalization so an apparent root reached via
 * a junction/traversal is not silently reinterpreted as a different cwd.
 */
export function isWorkspaceRootCwd(root: string, candidate: string): boolean {
  if (!path.isAbsolute(candidate) || candidate.split(/[\\/]/).some(part => part === "." || part === "..")) return false;
  const normalized = (value: string): string => path.normalize(value).replace(/[\\/]+$/, "");
  return normalized(candidate) === normalized(root);
}
