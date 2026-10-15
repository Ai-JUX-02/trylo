/**
 * 持久 Verification Authority registry 适配器。
 *
 * 只有组合根与测试可以 import 本目录（由
 * `learning/verification-authority/verification-authority.boundary.test.ts`
 * 的常驻架构扫描强制）：写能力一旦进入 `integration/**`、Board reducer 或
 * tooling production search，独立验证门就重新变成「调用方自报」。
 */

export {
  createFileVerificationRegistry,
  type FileVerificationRegistry,
  type FileVerificationRegistryOptions,
} from "./file-registry.js";

export {
  VERIFICATION_REGISTRY_FORMAT_VERSION,
  decodeRegistry,
  encodeRegistryEvent,
  lastSequence,
  registryKeySets,
  resolveReceipt,
  type RegistryDecode,
  type RegistryDecodeErr,
  type RegistryEvent,
  type ResolvedReceipt,
} from "./codec.js";

export { tryAcquireRegistryLock, type RegistryLock, type RegistryLockErr } from "./lock.js";
