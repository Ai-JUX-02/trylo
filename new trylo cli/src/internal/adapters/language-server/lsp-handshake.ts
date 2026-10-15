/**
 * Starting a language server, and nothing else.
 *
 * Split out of `client.ts` so that file stays lifecycle-and-limits: the
 * handshake is the part most likely to grow a capability line, and keeping
 * it beside the teardown bookkeeping made both harder to read than either
 * needs to be. Everything here takes what it needs as arguments; nothing
 * here owns the connection.
 */

import type { MessageConnection } from "vscode-jsonrpc/node";
import type { InitializeParams, InitializeResult } from "vscode-languageserver-protocol";
import { mapLspError } from "./lsp-request.js";
import type { LspFailure } from "../../ports/language-server.js";
import type { LspServerSpec } from "../../ports/language-server.js";
import { pathToUri } from "./lsp-uri.js";
import { withDeadline } from "./lsp-deadline.js";
import type { DocumentSynchroniser } from "./lsp-documents.js";

export type LspPreloadDocument = {
  readonly path: string;
  readonly languageId: string;
  readonly version: number;
  readonly text: string;
};

export type HandshakeTeardown = (detail: string) => void;

export async function handshake(
  open: MessageConnection,
  spec: LspServerSpec,
  requestTimeoutMs: number,
  teardown: HandshakeTeardown,
): Promise<LspFailure | { ok: true; value: InitializeResult }> {
  const params: InitializeParams = {
    processId: process.pid,
    rootUri: pathToUri(spec.workspaceRoot, spec.workspaceRoot),
    capabilities: {
      textDocument: {
        definition: {},
        references: {},
        hover: {},
        documentSymbol: {},
        implementation: {},
        callHierarchy: {},
      },
      workspace: { symbol: {} },
    },
    workspaceFolders: [{ uri: pathToUri(spec.workspaceRoot, spec.workspaceRoot), name: spec.workspaceRoot }],
  };
  try {
    // A server that never answers initialize must not hold the tool call
    // forever; on timeout we tear the process down rather than leave a
    // half-started server occupying a slot.
    const result = await withDeadline(
      open.sendRequest<InitializeResult>("initialize", params),
      requestTimeoutMs,
      () => teardown("initialize timed out"),
    );
    return { ok: true, value: result };
  } catch (error) {
    return mapLspError(error, `initialize ${spec.serverName}`);
  }
}

export async function preload(
  open: MessageConnection,
  documents: DocumentSynchroniser,
  preloadDocuments: ReadonlyArray<LspPreloadDocument>,
  log: (detail: string) => void,
): Promise<void> {
  for (const doc of preloadDocuments) {
    const result = await documents.push(open, doc);
    if (!result.ok) {
      log(result.message);
    }
  }
}

export async function sendNotification(open: MessageConnection, method: string, params: unknown): Promise<void> {
  await open.sendNotification(method, params);
}
