/** The names the web catalog declares. Kept apart so the sandbox planner can import them without a cycle. */
export const WEB_FETCH_TOOL = "web_fetch";
export const WEB_SEARCH_TOOL = "web_search";

/**
 * Every name a mounted `--allow-web` run may have admitted by name.
 *
 * The sandbox admits by name rather than by planner branch, so this set is what
 * "web tools are on" means at the admission gate. It is derived from the two
 * constants instead of being written out, because a hand-maintained third entry
 * here would be a name the gate admits and the catalog never declares.
 */
export const WEB_TOOL_NAMES: ReadonlySet<string> = new Set([WEB_FETCH_TOOL, WEB_SEARCH_TOOL]);
