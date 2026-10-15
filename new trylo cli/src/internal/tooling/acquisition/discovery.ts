import { readFile } from "node:fs/promises";
import { err, ok, type Result } from "../contract/result.js";
import type { ToolCandidate } from "../contract/types.js";

export type DiscoveryHit = {
  readonly candidate: ToolCandidate;
  readonly sourceIndex: string;
};

export type DiscoveryPort = {
  readonly search: (capability: string) => Result<readonly DiscoveryHit[], "discovery_failed">;
};

export function createFakeDiscoveryPort(index: readonly ToolCandidate[]): DiscoveryPort {
  return {
    search(capability: string) {
      if (capability.length === 0) {
        return err("discovery_failed", "capability query is required");
      }
      const hits = index.filter((candidate) =>
        candidate.capabilities.some((item) => item === capability || item.includes(capability)),
      );
      return ok(
        hits.map((candidate) => ({
          candidate,
          sourceIndex: "testdata/tool-learning/discovery-index.json",
        })),
      );
    },
  };
}

export async function loadDiscoveryIndex(
  filePath: string,
): Promise<Result<readonly ToolCandidate[], "discovery_failed">> {
  let raw: string;
  try {
    raw = await readFile(filePath, "utf8");
  } catch {
    return err("discovery_failed", "discovery index missing");
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return err("discovery_failed", "discovery index is not JSON");
  }
  if (typeof parsed !== "object" || parsed === null || !("candidates" in parsed)) {
    return err("discovery_failed", "discovery index missing candidates");
  }
  const candidates = (parsed as { candidates: unknown }).candidates;
  if (!Array.isArray(candidates)) {
    return err("discovery_failed", "discovery index candidates must be an array");
  }
  return ok(candidates as ToolCandidate[]);
}

export function normalizeHits(hits: readonly DiscoveryHit[]): readonly ToolCandidate[] {
  return hits.map((hit) => {
    const unverifiable = hit.candidate.unverifiableFields.length > 0
      ? hit.candidate.unverifiableFields
      : ["starCount"];
    return {
      ...hit.candidate,
      unverifiableFields: unverifiable,
    };
  });
}
