import { scheduleFilePath } from "../../adapters/schedule-store/codec.js";
import { tryloHome } from "./session-paths.js";

/**
 * Where the scheduler's durable record lives (WP26 / A06).
 *
 * ## Why the home formula is borrowed and not re-derived
 *
 * `tryloHome` is imported rather than spelled out, because a second copy of
 * that formula is right until the day `TRYLO_HOME` is set — and then only one
 * of the two homes would move, and the schedule would be written somewhere the
 * rest of the product never looks.
 *
 * It is *imported* and not re-declared, so this file is also the reason the
 * schedule directory shows up under the same `TRYLO_HOME` override as sessions,
 * the queue and the permission ledger. That is the point: a person who relocates
 * their home expects the scheduler to move with everything else, not to keep
 * firing from a directory they stopped using.
 *
 * ## Why the path lives here rather than in the adapter
 *
 * `scheduleFilePath` takes the home directory as an argument precisely so the
 * *formula* has one owner. This module owns which directory that is; the adapter
 * owns the file name inside it. Splitting it that way keeps "where is my
 * schedule" answerable from one place, which is the same rule the queue and the
 * ledger already follow.
 */
export function scheduleHome(homeDir: string, env: Readonly<Record<string, string | undefined>>): string {
  return tryloHome(homeDir, env);
}

/**
 * The record's path, from the same home formula as everything else.
 *
 * Two steps rather than one, because the caller has a `CliContext` (which knows
 * `homeDir` and `env`) and the adapter wants a directory. Passing the context
 * through would make this module depend on the CLI surface, and the surface is
 * the thing that should be depending on it.
 */
export function schedulePath(homeDir: string, env: Readonly<Record<string, string | undefined>>): string {
  return scheduleFilePath(scheduleHome(homeDir, env));
}
