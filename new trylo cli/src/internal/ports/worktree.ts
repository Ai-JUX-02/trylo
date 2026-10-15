/**
 * Worktree session port (WP25.2 / C79, L70, L28).
 *
 * Source contract: Codex `codex-rs/worktree/src/lib.rs` — `ManagedWorktree`
 * at `:29-37`, `create` `:61`, `list` `:167`, `bind_thread` `:273`, `remove`
 * `:284`. The port is the four operations and, more importantly, the
 * *refusals* that come with them; a worktree manager without the refusals is
 * a `rm -rf` with extra steps.
 *
 * Three promises shape the surface, and each has a test:
 *
 *  - **A checkout we did not create is not ours.** Membership is the path
 *    layout in `domain/worktree-layout.ts`, so a worktree the user made by
 *    hand never appears in `list` and can never be passed to `remove`.
 *  - **Refusal is not failure to clean up.** `remove` distinguishes "this
 *    checkout holds uncommitted work" from "git could not be run". Only the
 *    second is retryable, and neither is answered by deleting with `--force`.
 *    A person's dirty tree is their work, and losing it is worse than leaving
 *    a directory behind.
 *  - **One owner, written once.** Binding is exclusive: a second, different
 *    owner fails instead of taking over a checkout that is already running.
 *
 * Not owned here: deciding *when* a session wants a worktree (that is the
 * caller's policy), and the git operations inside one (existing file and
 * command tools keep their own cwd).
 */

import type { WorktreePlatform } from "../domain/worktree-layout.js";

/** A checkout we manage, plus the working directory a session should start in. */
export type ManagedWorktree = {
  readonly root: string;
  /** `root` plus the caller's directory relative to the repository root. */
  readonly cwd: string;
  readonly sourceRoot: string;
  readonly sourceCwd: string;
  readonly headSha: string;
  /** Absent for the detached HEAD we create; never implies "unknown". */
  readonly branch: string | undefined;
};

export const WORKTREE_FAILURE_CODES = [
  /** The pool root is not absolute; relative roots resolve against the wrong cwd. */
  "relative_root",
  /** A path could not be resolved on disk at all. */
  "unresolved_path",
  /** Every bucket name we tried was taken; the pool is full or not a pool. */
  "bucket_exhausted",
  /** `git rev-parse --show-toplevel` failed: not a repository. */
  "not_a_repository",
  /** The requested cwd is outside the repository root. */
  "outside_repository",
  /** git is missing or the spawn failed: nothing ran. */
  "git_unavailable",
  /** git ran and reported failure; `detail` carries its stderr. */
  "git_failed",
  /** Not our layout, so not ours to delete. */
  "not_managed",
  /** The caller is standing inside the checkout it asked to delete. */
  "current_checkout",
  /** Ignored local files are present; removing them is the user's call. */
  "has_ignored_files",
  /** Another owner already holds this checkout. */
  "already_owned",
  /** The ownership record is missing a version, unreadable, or not ours. */
  "owner_invalid",
  /** The caller's signal fired. */
  "cancelled",
] as const;

export type WorktreeFailureCode = (typeof WORKTREE_FAILURE_CODES)[number];

export type WorktreeFailure = {
  readonly ok: false;
  readonly code: WorktreeFailureCode;
  /** Operator-readable, and safe to show: never a bare stack. */
  readonly detail: string;
};

export type WorktreeOutcome<T> = { readonly ok: true; readonly value: T } | WorktreeFailure;

export type CreateWorktreeRequest = {
  /** Directory to branch from; resolved into a repository root. */
  readonly sourceCwd: string;
  /** Revision to check out; `HEAD` when absent. Tags are peeled to commits. */
  readonly base?: string;
  /** Environment for the child, from the caller's injection seam. */
  readonly baseEnv?: Readonly<Record<string, string | undefined>>;
  readonly signal?: AbortSignal;
};

export type ListWorktreesRequest = {
  readonly sourceCwd: string;
  readonly baseEnv?: Readonly<Record<string, string | undefined>>;
  readonly signal?: AbortSignal;
};

export type BindOwnerRequest = {
  readonly root: string;
  readonly ownerId: string;
  readonly baseEnv?: Readonly<Record<string, string | undefined>>;
  readonly signal?: AbortSignal;
};

export type OwnerQueryRequest = {
  readonly root: string;
  readonly baseEnv?: Readonly<Record<string, string | undefined>>;
  readonly signal?: AbortSignal;
};

export type RemoveWorktreeRequest = {
  /** Where the caller currently is: deleting the checkout you are inside fails. */
  readonly sourceCwd: string;
  readonly root: string;
  readonly baseEnv?: Readonly<Record<string, string | undefined>>;
  readonly signal?: AbortSignal;
};

/** Settings the port needs, all injected — nothing here reads ambient state. */
export type WorktreeSettings = {
  /** Absolute pool root. Every managed checkout lives two levels below it. */
  readonly root: string;
  readonly platform: WorktreePlatform;
};

export type WorktreePort = {
  settings(): WorktreeSettings;
  create(request: CreateWorktreeRequest): Promise<WorktreeOutcome<ManagedWorktree>>;
  /** Only checkouts matching our layout, in ascending `root` order. */
  list(request: ListWorktreesRequest): Promise<WorktreeOutcome<ReadonlyArray<ManagedWorktree>>>;
  /** Exclusive: succeeds when already bound to the same owner, fails otherwise. */
  bindOwner(request: BindOwnerRequest): Promise<WorktreeOutcome<undefined>>;
  /** `undefined` means unowned, which is a real answer and not an error. */
  ownerOf(request: OwnerQueryRequest): Promise<WorktreeOutcome<string | undefined>>;
  remove(request: RemoveWorktreeRequest): Promise<WorktreeOutcome<undefined>>;
};
