import { sha256Hex } from "./hash.js";
import { domainFailure, type DomainFailure } from "./types.js";

export function ruleIdentity(parts: readonly string[]): string {
  return sha256Hex(parts.map((part) => part.trim().toLowerCase()).join("|"));
}

export function blockDualSave(
  skillIdentity: string | undefined,
  workflowIdentity: string | undefined,
): DomainFailure | undefined {
  if (
    skillIdentity !== undefined &&
    workflowIdentity !== undefined &&
    skillIdentity === workflowIdentity
  ) {
    return domainFailure(
      "dual_save_blocked",
      "the same rule cannot be stored as both skill and workflow",
    );
  }
  return undefined;
}
