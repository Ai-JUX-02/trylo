import { err, ok, type Result } from "../contract/result.js";
import type { CatalogLifecycle, ToolPackageVersion } from "../contract/types.js";

const ALLOWED: Readonly<Record<CatalogLifecycle, readonly CatalogLifecycle[]>> = {
  discovered: ["assessed", "rejected"],
  assessed: ["awaiting_acquire_approval", "awaiting_modify_approval", "rejected"],
  awaiting_acquire_approval: ["quarantined", "rejected"],
  awaiting_modify_approval: ["designing", "rejected"],
  designing: ["building", "rejected"],
  building: ["quarantined", "rejected"],
  quarantined: ["verifying", "rejected"],
  verifying: ["verified", "rejected"],
  verified: ["awaiting_activation_approval", "rejected"],
  awaiting_activation_approval: ["rejected"],
  rejected: [],
};

export function canTransitionCatalog(
  from: CatalogLifecycle,
  to: CatalogLifecycle,
): boolean {
  return ALLOWED[from].includes(to);
}

export function transitionCatalog(
  pkg: ToolPackageVersion,
  to: CatalogLifecycle,
): Result<ToolPackageVersion, "illegal_catalog_transition"> {
  if (!canTransitionCatalog(pkg.catalogState, to)) {
    return err(
      "illegal_catalog_transition",
      `${pkg.catalogState} cannot transition to ${to}; Board owns shadow/active`,
    );
  }
  return ok({ ...pkg, catalogState: to });
}

export function catalogCannotBecomeActive(state: CatalogLifecycle): boolean {
  return (state as string) !== "active";
}
