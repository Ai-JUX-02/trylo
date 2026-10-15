/**
 * Containment moved to `tools/shared/workspace.ts` when mutating tools arrived:
 * one owner for the rule that decides whether a path belongs to the workspace,
 * rather than a read copy and a write copy that can drift apart.
 *
 * This module is kept as the import site so the read-only tests and any earlier
 * reader of `.` keep working without knowing where the rule lives now.
 */
export * from "../shared/workspace.js";
