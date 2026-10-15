import type {
  BindOwnerRequest,
  CreateWorktreeRequest,
  ListWorktreesRequest,
  OwnerQueryRequest,
  RemoveWorktreeRequest,
  WorktreePort,
  WorktreeSettings,
} from "../../ports/worktree.js";
import type { GitCommandRunner } from "../../surface/cli/git-diff.js";
import { createManagedWorktree } from "./worktree-create.js";
import { createNodeWorktreeIo, type WorktreeIo } from "./worktree-io.js";
import { listManagedWorktrees, removeManagedWorktree } from "./worktree-lifecycle.js";
import { bindManagedOwner, ownerOfManagedWorktree } from "./worktree-owner.js";
import type { WorktreeContext } from "./worktree-support.js";

/**
 * The worktree port, assembled (WP25.2 / C79, L70, L28).
 *
 * Thin on purpose: every operation lives in its own module next to the git
 * command it wraps, and this file only owns the seams. Two of them are
 * environmental and are therefore injectable — nothing here reads ambient
 * state except through a default a caller can replace:
 *
 *  - `io` — the few filesystem facts the manager needs (`worktree-io.ts`).
 *  - `randomHex` — bucket names. Testable allocation is the whole point: a
 *    fixed seam can force a collision and prove the retry works.
 *
 * The pool root and platform come from `settings` and are fixed for the life of
 * the manager, because a checkout that moved pools mid-session would be
 * unreachable by `list` and therefore undeletable.
 */

export type WorktreeManagerOptions = {
  readonly settings: WorktreeSettings;
  readonly runner: GitCommandRunner;
  readonly io?: WorktreeIo;
  /** Defaults to `crypto.randomUUID`; must yield at least four hex characters. */
  readonly randomHex?: () => string;
};

export function createWorktreeManager(options: WorktreeManagerOptions): WorktreePort {
  const context: WorktreeContext = {
    settings: options.settings,
    runner: options.runner,
    io: options.io ?? createNodeWorktreeIo(),
    randomHex: options.randomHex ?? ((): string => globalThis.crypto.randomUUID().replaceAll("-", "")),
  };

  return {
    settings: (): WorktreeSettings => options.settings,
    create: (request: CreateWorktreeRequest) => createManagedWorktree(context, request),
    list: (request: ListWorktreesRequest) => listManagedWorktrees(context, request),
    bindOwner: (request: BindOwnerRequest) => bindManagedOwner(context, request),
    ownerOf: (request: OwnerQueryRequest) => ownerOfManagedWorktree(context, request),
    remove: (request: RemoveWorktreeRequest) => removeManagedWorktree(context, request),
  };
}
