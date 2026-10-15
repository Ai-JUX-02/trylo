import { err, ok, type Result } from "../contract/result.js";
import type { PluginRecord } from "./registry.js";

/**
 * WP16.3 plugin contributions — how an installed plugin reaches the run.
 *
 * Reused mechanics:
 * - legacy `commands.ts loadAllCommands`: bundled + builtin-plugin + skill-dir
 *   + workflow + plugin commands + plugin skills, plugins before builtins in
 *   the merged list; `getSkillToolCommands` only exposes
 *   `type:prompt && !disableModelInvocation` to the model.
 * - legacy `loadPluginAgents`: enabled-only, walk `agents/` markdown,
 *   qualified name `${plugin}:${namespace}:${basename}`; `permissionMode`,
 *   `hooks`, `mcpServers` are intentionally ignored with a warning.
 * - legacy `loadPluginOutputStyles`: enabled-only, qualified name
 *   `${plugin}:${basename}`, `force-for-plugin` honored.
 *
 * Snapshot rule (WP16.3 acceptance): consumers freeze a
 * `ContributionSnapshot` carrying the registry `generation`. A concurrent
 * install/uninstall bumps the generation; already-dispatched requests keep
 * their frozen meaning instead of silently changing shape.
 */

export type PluginContribution = {
  readonly pluginId: string;
  readonly commands: ReadonlyArray<string>;
  readonly skills: ReadonlyArray<string>;
  readonly agents: ReadonlyArray<string>;
  readonly outputStyles: ReadonlyArray<string>;
};

export type ContributionSnapshot = {
  readonly generation: number;
  readonly contributions: ReadonlyArray<PluginContribution>;
  readonly frozenAt: string;
};

export type PluginContributionFailure = "stale_snapshot" | "unknown_contribution";

export function aggregateContributions(input: {
  readonly enabled: ReadonlyArray<PluginRecord>;
  readonly contributions: Readonly<Record<string, PluginContribution>>;
  readonly generation: number;
  readonly now: string;
}): ContributionSnapshot {
  const frozen = input.enabled
    .map((record) => input.contributions[record.pluginId])
    .filter((entry): entry is PluginContribution => entry !== undefined);
  return { generation: input.generation, contributions: frozen, frozenAt: input.now };
}

export function snapshotCoversGeneration(
  snapshot: ContributionSnapshot,
  generation: number,
): Result<ContributionSnapshot, PluginContributionFailure> {
  if (snapshot.generation !== generation) {
    return err(
      "stale_snapshot",
      `contribution snapshot at generation ${snapshot.generation} no longer covers ${generation}`,
    );
  }
  return ok(snapshot);
}

function qualified(pluginId: string, name: string): string {
  return `${pluginId}:${name}`;
}

export function pluginSkillToolName(pluginId: string, skill: string): string {
  return qualified(pluginId, skill);
}

export function pluginAgentName(pluginId: string, namespace: string, basename: string): string {
  return `${pluginId}:${namespace}:${basename}`;
}

export function pluginStyleName(pluginId: string, basename: string): string {
  return qualified(pluginId, basename);
}

/** Registration is not consumption: lookup requires the frozen snapshot. */
export function findSkillInSnapshot(
  snapshot: ContributionSnapshot,
  skill: string,
): Result<{ readonly pluginId: string; readonly skill: string }, PluginContributionFailure> {
  for (const contribution of snapshot.contributions) {
    if (contribution.skills.includes(skill)) {
      return ok({ pluginId: contribution.pluginId, skill });
    }
  }
  return err("unknown_contribution", `skill ${skill} is registered by no snapshotted plugin`);
}

export function findCommandInSnapshot(
  snapshot: ContributionSnapshot,
  command: string,
): Result<{ readonly pluginId: string; readonly command: string }, PluginContributionFailure> {
  for (const contribution of snapshot.contributions) {
    if (contribution.commands.includes(command)) {
      return ok({ pluginId: contribution.pluginId, command });
    }
  }
  return err("unknown_contribution", `command ${command} is registered by no snapshotted plugin`);
}
