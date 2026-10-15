import type {
  AssetKind,
  LearningDomain,
  ProposalSource,
} from "../../learning/control/contracts.js";
import type { Scope } from "../../learning/domains/shared/types.js";

/** C 的 `Scope{kind,id}` → Board canonical scope 字符串。唯一投影，不允许调用方另传一份。 */
export function projectionScope(scope: Scope): string {
  return `${scope.kind}:${scope.id}`;
}

const DOMAIN_BY_ASSET_KIND: Readonly<Record<AssetKind, LearningDomain>> = {
  user_rule: "user",
  prompt_patch: "prompt",
  skill: "skill",
  workflow: "workflow",
  tool_binding: "tool",
  tool_package: "tool",
  verification_recipe: "verifier",
  routing_policy: "routing",
};

export function domainForAssetKind(kind: AssetKind): LearningDomain {
  return DOMAIN_BY_ASSET_KIND[kind];
}

/** C 的 provenance.source 语义与 canonical ProposalSource 一一对应，不是猜测。 */
export function proposalSourceFor(
  source: "user_explicit" | "inferred_from_observations",
): ProposalSource {
  return source === "user_explicit" ? "user_explicit" : "inferred";
}
