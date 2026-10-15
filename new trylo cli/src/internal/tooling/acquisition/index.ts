export { assessCandidates, type Assessment, type ScoredCandidate } from "./comparator.js";
export {
  createFakeDiscoveryPort,
  loadDiscoveryIndex,
  normalizeHits,
  type DiscoveryHit,
  type DiscoveryPort,
} from "./discovery.js";
export { classifyLicense } from "./license-policy.js";
export {
  requestVettingEvidence,
  vetCandidate,
  type VettingEvidenceRequest,
  type VettingReport,
} from "./vetting.js";
