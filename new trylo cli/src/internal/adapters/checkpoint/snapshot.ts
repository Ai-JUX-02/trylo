import { copyFileSync, mkdirSync, readdirSync } from "node:fs";
import path from "node:path";
import {
  CHECKPOINT_FORMAT_VERSION,
  type CheckpointFileEntry,
  type CheckpointResult,
  type SnapshotOutcome,
} from "../../ports/checkpoint.js";
import { sealManifest, serializeManifest, sortEntries } from "./manifest.js";
import type { WalkedFile } from "./walk.js";
import {
  discard,
  failureOf,
  filesDirectory,
  type StorePaths,
  manifestPathOf,
  nativeJoin,
  sha256Of,
  writeAtomic,
} from "./support.js";

/**
 * Taking a snapshot.
 *
 * Order matters and is asserted by tests: every input is proven before any file
 * is copied, and the manifest is written last. A snapshot without its manifest
 * would be a directory of files nobody can verify or safely apply.
 */

export function takeSnapshot(input: {
  readonly paths: StorePaths;
  readonly checkpointId: string;
  readonly label: string;
  readonly createdAt: string;
  readonly files: readonly WalkedFile[];
  readonly ignoredNames: readonly string[];
  readonly maxFiles: number;
  readonly maxTotalBytes: number;
}): CheckpointResult<SnapshotOutcome> {
  const oversized = describeOverflow(input.files, input.maxFiles, input.maxTotalBytes);
  if (oversized !== undefined) {
    return failureOf("size_limit_exceeded", oversized);
  }
  return writeSnapshot(input);
}

function describeOverflow(
  files: readonly WalkedFile[],
  maxFiles: number,
  maxTotalBytes: number,
): string | undefined {
  const totalBytes = files.reduce((sum, file) => sum + file.bytes, 0);
  if (files.length > maxFiles) {
    return `${files.length} files > ${maxFiles}`;
  }
  if (totalBytes > maxTotalBytes) {
    return `${totalBytes} bytes > ${maxTotalBytes}`;
  }
  return undefined;
}

/** Sequential and derived from what already exists: no clock, no randomness. */
export function nextCheckpointId(storageRoot: string, label: string): string {
  let count = 0;
  try {
    count = readdirSync(storageRoot, { withFileTypes: true }).filter((entry) => entry.isDirectory())
      .length;
  } catch {
    count = 0;
  }
  const slug = label.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
  return `cp-${String(count + 1).padStart(4, "0")}${slug.length > 0 ? `-${slug}` : ""}`;
}

function writeSnapshot(input: {
  readonly paths: StorePaths;
  readonly checkpointId: string;
  readonly label: string;
  readonly createdAt: string;
  readonly files: readonly WalkedFile[];
  readonly ignoredNames: readonly string[];
}): CheckpointResult<SnapshotOutcome> {
  const filesRoot = filesDirectory(input.paths, input.checkpointId);
  try {
    mkdirSync(filesRoot, { recursive: true });
  } catch (error) {
    return failureOf("storage_unavailable", String(error));
  }

  const entries: CheckpointFileEntry[] = [];
  for (const file of input.files) {
    const stored = nativeJoin(filesRoot, file.relativePath);
    try {
      mkdirSync(path.dirname(stored), { recursive: true });
      copyFileSync(file.absolutePath, stored);
    } catch (error) {
      discard(input.paths.checkpointRoot(input.checkpointId));
      return failureOf("snapshot_interrupted", `${file.relativePath}: ${String(error)}`);
    }
    let sha256: string;
    try {
      sha256 = sha256Of(stored);
    } catch (error) {
      discard(input.paths.checkpointRoot(input.checkpointId));
      return failureOf("snapshot_interrupted", `${file.relativePath}: ${String(error)}`);
    }
    entries.push({ path: file.relativePath, bytes: file.bytes, sha256 });
  }

  const manifest = sealManifest({
    formatVersion: CHECKPOINT_FORMAT_VERSION,
    checkpointId: input.checkpointId,
    label: input.label,
    createdAt: input.createdAt,
    fileCount: entries.length,
    totalBytes: entries.reduce((sum, entry) => sum + entry.bytes, 0),
    ignores: input.ignoredNames,
    files: sortEntries(entries),
  });
  try {
    writeAtomic(manifestPathOf(input.paths, input.checkpointId), serializeManifest(manifest));
  } catch (error) {
    discard(input.paths.checkpointRoot(input.checkpointId));
    return failureOf("snapshot_interrupted", String(error));
  }
  return { ok: true, value: { checkpointId: input.checkpointId, manifest } };
}
