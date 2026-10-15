import path from "node:path";
import { discoverRoles, type RoleRoot } from "../../adapters/subagent-roles/discover.js";
import { createNodeRoleReader } from "../../adapters/subagent-roles/wiring.js";
import type { SubagentRole } from "../../subagent/role.js";
import { tryloHome } from "./session-paths.js";

/**
 * Where a run's subagent roles come from (WP22.2b / C44, L27).
 *
 * Two layers, most specific first — the same shape as `skills-wiring.ts`, and
 * for the same reason: a role file is an artefact a person writes next to
 * their work or next to their profile, and the project one should win.
 *
 * The account root comes from `tryloHome`, the only formula for it. Writing
 * `${home}/agents` here would be the second formula, and the second formula is
 * the one that silently points somewhere else for whoever installs differently.
 *
 * The fallback role is a file like any other: omitting `agent_type` looks for
 * a role named `default` — a `default.md` in either layer, project first — and
 * only when neither layer defines one does the child run on the parent's own
 * settings. There is no other default: a second, implicit fallback would be a
 * role nobody wrote and nobody can read.
 */

export type RolesWiring = {
  readonly roles: ReadonlyArray<SubagentRole>;
  readonly problems: ReadonlyArray<string>;
};

export function rolesFor(
  homeDir: string,
  env: Readonly<Record<string, string | undefined>>,
  workspaceRoot: string,
): RolesWiring {
  const roots: ReadonlyArray<RoleRoot> = [
    { source: "project", directory: path.join(workspaceRoot, ".trylo", "agents") },
    { source: "user", directory: path.join(tryloHome(homeDir, env), "agents") },
  ];
  const discovery = discoverRoles(roots, createNodeRoleReader());
  return { roles: discovery.roles, problems: discovery.problems };
}
