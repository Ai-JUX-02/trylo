/**
 * What the server said it can do, as plain data.
 *
 * Copied out of the protocol type on purpose. The core asks "can this server
 * answer a hover?" long after the connection is gone — a tool description, a
 * capability probe, a doctor line — and none of those should need a live process
 * or a protocol import to answer. If a `LspServerCapabilities` ever needs a
 * method from the library, this file is where it leaked and the copy is wrong.
 */

import type { ServerCapabilities } from "vscode-languageserver-protocol";
import type { LspServerCapabilities } from "../../ports/language-server.js";
import { NO_LSP_CAPABILITIES } from "../../ports/language-server.js";

/**
 * A capability is present if the server advertises the key at all. A server that
 * answers `{}` supports nothing; one that omits a key supports nothing for that
 * operation. Neither means "ask anyway and see".
 */
export function toCapabilities(capabilities: ServerCapabilities | undefined): LspServerCapabilities {
  if (capabilities === undefined) {
    return NO_LSP_CAPABILITIES;
  }
  return {
    definition: has(capabilities.definitionProvider),
    references: has(capabilities.referencesProvider),
    hover: has(capabilities.hoverProvider),
    documentSymbol: has(capabilities.documentSymbolProvider),
    workspaceSymbol: has(capabilities.workspaceSymbolProvider),
    implementation: has(capabilities.implementationProvider),
    callHierarchy: has(capabilities.callHierarchyProvider),
  };
}

function has(value: unknown): boolean {
  return value !== undefined && value !== null && value !== false;
}
