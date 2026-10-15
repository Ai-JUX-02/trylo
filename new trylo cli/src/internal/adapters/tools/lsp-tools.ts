import type { ToolBinding, ToolCallRequest, ToolOutcome, ToolPort } from "../../ports/tools.js";
import type { LanguageServerPool } from "../../adapters/language-server/registry.js";
import { LSP_TOOL } from "./lsp-names.js";
import { runLspQuery, type LspToolDeps } from "./lsp-query.js";

/**
 * One tool, six operations.
 *
 * # Why a single tool rather than six
 *
 * A model asked to choose between `lsp_definition` and `lsp_references` has to
 * pick a name before it knows what the file contains, and the wrong guess costs
 * a wasted turn. One tool with an `operation` argument lets the same call be
 * refined without leaving the tool, which is the whole point of having a model
 * choose at all. The operations stay a closed set in `ports/language-server.ts`
 * — this is not an open passthrough to whatever the server advertises.
 *
 * # Why this is a separate port rather than part of the read-only tools
 *
 * Read-only tools answer from files this process can already see. This one
 * starts a **program**. Those are different questions, and folding them
 * together would mean the read-only mount — which is available in every mode,
 * including read-only mode — could start a child process as a side effect of
 * asking about a symbol.
 *
 * # The permission question, answered explicitly
 *
 * `needsApproval: false`, and the reasoning is worth stating because the
 * opposite looks obvious. Starting a language server *is* running a program, so
 * it cannot be invisible. But the program is not chosen by the model: it is the
 * one the configuration named for this file type, resolved by extension, and
 * starting it is gated by the injected `authorize` hook — the same hook that
 * gates every other program start. The model chooses *which question to ask*, not
 * *what to execute*.
 *
 * The consequence is stated rather than hidden: a session with a language server
 * configured will start it on the first navigation question. That is the intended
 * behaviour, it is bounded by `maxServers`, and it is reported in the result
 * (`serverStarted: true`) so it is never invisible.
 */

export const LSP_BINDING: ToolBinding = {
  name: LSP_TOOL,
  description:
    "Ask a language server about the code: where a symbol is defined, who references it, what its type or documentation is, what a file declares, what implements an interface, or who calls a function. " +
    "This understands meaning — it resolves names through the real type system, so it answers about code you have not read. " +
    "path is workspace-relative and line/character are 0-based, exactly as read_file reports them. " +
    "The first question may start the configured language server for that file type; the result says so. " +
    "An answer of 'no results' means the server found nothing there, which is different from a failure: a failure names its reason (no server configured, could not start, timed out).",
  sideEffect: "read_only",
  parameters: {
    type: "object",
    properties: {
      operation: {
        type: "string",
        enum: ["definition", "references", "hover", "document_symbols", "implementation", "call_hierarchy"],
        description: "What to ask. document_symbols lists what a whole file declares and ignores line/character.",
      },
      path: { type: "string", description: "Workspace-relative path of the file, the same spelling read_file takes." },
      line: { type: "integer", minimum: 0, description: "0-based line of the symbol. Not used by document_symbols." },
      character: { type: "integer", minimum: 0, description: "0-based column. Not used by document_symbols." },
    },
    required: ["operation", "path"],
    additionalProperties: false,
  },
  needsApproval: false,
  // Longer than the read-only tools' 10s: this one may pay for a server start
  // (spawn + initialize) before it can answer anything at all.
  timeoutMs: 30_000,
  outputLimits: { maxBytes: 64 * 1024, maxLines: 1_000 },
};

/**
 * Builds the tool port. The pool is injected rather than created here so the
 * caller owns the process lifetime — a tool that could close every language
 * server, or that silently kept them after the turn, would be deciding something
 * that belongs to the session.
 */
export function createLspTools(pool: LanguageServerPool, deps: LspToolDeps): ToolPort {
  return {
    snapshot(): ReadonlyArray<ToolBinding> {
      return [LSP_BINDING];
    },
    async execute(call: ToolCallRequest, signal: AbortSignal): Promise<ToolOutcome> {
      if (call.name !== LSP_TOOL) {
        return { outcome: "error", code: "unknown_tool", message: `unknown_tool:${call.name}` };
      }
      return runLspQuery(pool, deps, call, signal);
    },
    async cancel(): Promise<void> {
      // In-flight requests are settled by the connection's own abort handling;
      // there is nothing to unwind here that the pool does not already own.
      return;
    },
  };
}
