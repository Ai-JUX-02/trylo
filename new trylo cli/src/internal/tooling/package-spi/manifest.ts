import { err, ok, type Result } from "../contract/result.js";
import type { ToolPackageManifest, ToolPackageVersion } from "../contract/types.js";

export type ManifestFailure =
  | "missing_cancel"
  | "missing_timeout"
  | "missing_health"
  | "missing_idempotency"
  | "missing_output_bounds"
  | "postinstall_not_forbidden"
  | "not_isolated"
  | "overwrite_forbidden"
  | "third_party_type_leak";

export function validateManifest(
  manifest: ToolPackageManifest,
): Result<ToolPackageManifest, ManifestFailure> {
  if (manifest.healthProbe !== true) {
    return err("missing_health", "package SPI requires a health probe");
  }
  if (manifest.cancelSupported !== true) {
    return err("missing_cancel", "package SPI requires cancel support");
  }
  if (manifest.timeoutMs <= 0) {
    return err("missing_timeout", "package SPI requires a positive timeout");
  }
  if (manifest.idempotencyKeyRequired !== true || manifest.sideEffectCommitPoint.length === 0) {
    return err("missing_idempotency", "package SPI requires idempotency and a side-effect commit point");
  }
  if (manifest.stdoutBytes <= 0 || manifest.stderrBytes <= 0 || manifest.resultChars <= 0) {
    return err("missing_output_bounds", "package SPI requires output bounds");
  }
  if (manifest.postinstall !== "forbidden") {
    return err("postinstall_not_forbidden", "postinstall is forbidden by default");
  }
  if (manifest.processIsolation !== true || manifest.mcpTransport !== "stdio") {
    return err("not_isolated", "learned tools must be out-of-process MCP packages");
  }
  if (manifest.thirdPartyTypes !== "isolated") {
    return err("third_party_type_leak", "third-party types must not leak into Trylo core");
  }
  return ok(manifest);
}

export function assertNewVersion(
  previous: ToolPackageVersion | undefined,
  next: ToolPackageVersion,
): Result<ToolPackageVersion, ManifestFailure> {
  if (previous !== undefined && previous.packageVersionId === next.packageVersionId) {
    return err("overwrite_forbidden", "package updates must create a new version id");
  }
  if (previous !== undefined && previous.contentHash === next.contentHash && previous.version === next.version) {
    return err("overwrite_forbidden", "package updates must not overwrite the active version in place");
  }
  return ok(next);
}

export type ToolOutput = {
  readonly stdout: string;
  readonly stderr: string;
  readonly result: string;
};

export type OutputBoundFailure = "stdout_truncated" | "stderr_truncated" | "result_truncated" | "secret_leak";

const SECRET_MARKERS = ["AKIA", "BEGIN PRIVATE KEY", "xoxb-", "ghp_"];

export function enforceOutputBounds(
  manifest: ToolPackageManifest,
  output: ToolOutput,
): Result<ToolOutput, OutputBoundFailure> {
  for (const marker of SECRET_MARKERS) {
    if (output.stdout.includes(marker) || output.stderr.includes(marker) || output.result.includes(marker)) {
      return err("secret_leak", "tool output contained a secret marker");
    }
  }
  if (Buffer.byteLength(output.stdout, "utf8") > manifest.stdoutBytes) {
    return err("stdout_truncated", "stdout exceeded package bound");
  }
  if (Buffer.byteLength(output.stderr, "utf8") > manifest.stderrBytes) {
    return err("stderr_truncated", "stderr exceeded package bound");
  }
  if (output.result.length > manifest.resultChars) {
    return err("result_truncated", "result exceeded package bound");
  }
  return ok(output);
}
