import type { TurnHostInput } from "./host.js";
import { ruleChangeNoticeFor } from "./rule-changes.js";

/** The journal keeps yesterday's rule facts; a resumed turn adopts today's
 * files and reports changed or unreadable project guidance before rendering.
 */
export function reportProjectNotices(input: Pick<TurnHostInput, "resumeRecords" | "projectContext" | "sink">): void {
  const notice = ruleChangeNoticeFor(input.resumeRecords, input.projectContext?.sources);
  for (const problem of input.projectContext?.problems ?? []) input.sink.stderr(`warning: ${problem}\n`);
  if (notice !== undefined) input.sink.stderr(`${notice}\n`);
}
