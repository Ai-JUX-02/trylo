/**
 * Where the authoritative coverage matrix lives.
 *
 * Two scripts need this answer and neither may answer it differently: if the
 * parity check reads one file and the priority ledger reads another, the two
 * disagree about maturity without either being wrong about its own input. The
 * mapping names the path, so both resolve it from there.
 */
import { isAbsolute, join, relative } from "node:path";

const FALLBACK = join(
  "docs",
  "02-分期工程产出",
  "P00-工程地基与质量门禁",
  "evidence",
  "2026-10-04-parity-v1",
  "capability-coverage.json",
);

/** Accepts the absolute Windows form the mapping carries, or a repo-relative one. */
export function resolveCoveragePath(root, mapping) {
  const declared = mapping.authoritativeCoverage;
  if (typeof declared !== "string" || declared.length === 0) {
    return join(root, FALLBACK);
  }
  return isAbsolute(declared) ? declared : join(root, declared);
}

/** Repo-relative, forward-slashed, for writing into a report. */
export function coveragePathForReport(root, absolutePath) {
  const rel = relative(root, absolutePath);
  return (rel.startsWith("..") ? absolutePath : rel).replaceAll("\\", "/");
}