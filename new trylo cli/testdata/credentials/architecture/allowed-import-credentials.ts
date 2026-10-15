/**
 * Scanner fixture: the allowed import shape. Must produce zero violations —
 * only relative imports into the credentials package, its port, and `node:`
 * builtins.
 */

import { createHash } from "node:crypto";
import path from "node:path";
import type { CredentialPort } from "../../../src/internal/ports/credentials.js";
import { emptyDocument } from "../../../src/internal/credentials/document.js";
import { createMemoryLedgerStore } from "../../../src/internal/adapters/credentials/memory-ledger-store.js";

export const allowed = {
  createHash,
  path,
  emptyDocument,
  createMemoryLedgerStore,
} satisfies Record<string, unknown>;

export type Port = CredentialPort;
