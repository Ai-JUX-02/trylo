import { closeSync, openSync, unlinkSync } from "node:fs";
import type { ReasonCode } from "../../learning/control/reasons.js";

export type LockHandle = {
  readonly path: string;
  readonly fd: number;
};

export type LockErr = {
  readonly ok: false;
  readonly reason: Extract<ReasonCode, "multi_writer">;
  readonly detail: string;
};

export function tryAcquireLock(lockPath: string): LockHandle | LockErr {
  try {
    const fd = openSync(lockPath, "wx");
    return { path: lockPath, fd };
  } catch (err) {
    if (isExist(err)) {
      return { ok: false, reason: "multi_writer", detail: lockPath };
    }
    throw err;
  }
}

export function releaseLock(handle: LockHandle): void {
  closeSync(handle.fd);
  try {
    unlinkSync(handle.path);
  } catch (err) {
    if (!isNotFound(err)) {
      throw err;
    }
  }
}

function isExist(err: unknown): boolean {
  return hasCode(err, "EEXIST");
}

function isNotFound(err: unknown): boolean {
  return hasCode(err, "ENOENT");
}

function hasCode(err: unknown, code: string): boolean {
  return (
    typeof err === "object" &&
    err !== null &&
    "code" in err &&
    (err as { code: unknown }).code === code
  );
}
