/**
 * computer-use / WebBrowser availability ledger (WP19.3: A09).
 *
 * This module is a refusal, not a feature: both baselines were audited and
 * neither yields a runnable computer-use chain today —
 *
 * - legacy `src/tools.ts:117` gates a real `WebBrowserTool`, but
 *   `scripts/build.mjs:132-136` replaces every `@ant/*` import with a virtual
 *   empty module emitting `BROWSER_TOOLS: []` / `COMPUTER_USE_TOOLS: []`;
 * - legacy `src/entrypoints/cli.tsx:86` reaches a real `computerUse/mcpServer`
 *   only behind the `CHICAGO_MCP` flag with its own host/setup chain;
 * - Codex contributes no local computer-use tool implementation to reuse.
 *
 * Copying the empty arrays into this tree would make listings and counts
 * report a capability that executes nothing. So the status below stays
 * `source_missing` until a real implementation lands with a transport, an
 * authorization boundary, and a test that drives it — flipping this flag
 * without those three is the exact masquerade this file exists to block.
 */

export type ComputerUseStatus =
  | { readonly available: true }
  | {
      readonly available: false;
      readonly reason: "source_missing";
      readonly missing: ReadonlyArray<string>;
    };

export function computerUseStatus(): ComputerUseStatus {
  return {
    available: false,
    reason: "source_missing",
    missing: [
      "browser automation transport (no @ant/* implementation in either baseline)",
      "computer-use host/setup chain behind CHICAGO_MCP with device authorization",
      "Trylo ToolPort adapter with permission + isolation boundaries",
    ],
  };
}

export type ComputerUseRefusal = {
  readonly outcome: "error";
  readonly code: "computer_use_unavailable";
  readonly message: string;
};

/** The only execution path until the status above flips with evidence. */
export function refuseComputerUse(action: string): ComputerUseRefusal {
  return {
    outcome: "error",
    code: "computer_use_unavailable",
    message: `computer_use_unavailable: ${action} blocked (source_missing; see computerUseStatus)`,
  };
}
