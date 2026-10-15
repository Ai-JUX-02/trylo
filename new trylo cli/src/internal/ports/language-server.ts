/**
 * Project navigation a language server can answer, in Trylo's own words.
 *
 * A language server is a *source* of navigation truth, not the owner of it. Its
 * wire types (`vscode-languageserver-protocol`) stay inside the LSP adapter; the
 * loop, the tools and the journal only ever see the shapes below. That is the
 * whole point of the split: swapping the transport, or the protocol package, or
 * the server itself must not ripple past the adapter, and a stored result must
 * stay readable after any of those change.
 *
 * Nothing here is an LSP type, and nothing here may grow one.
 */

/**
 * The six operations WP12.2 delivers. A closed set on purpose: a language
 * server advertises dozens of requests, and an open-ended passthrough would let
 * a server quietly become the owner of what "navigation" means.
 */
export const LSP_OPERATIONS = [
  "definition",
  "references",
  "hover",
  "document_symbols",
  "implementation",
  "call_hierarchy",
] as const;

export type LspOperation = (typeof LSP_OPERATIONS)[number];

/** Where a navigation answer points. Lines are 0-based, as LSP reports them. */
export type LspLocation = {
  /** Workspace-relative, POSIX separators — the one spelling the journal keeps. */
  readonly path: string;
  readonly line: number;
  readonly character: number;
  readonly endLine?: number;
  readonly endCharacter?: number;
};

export type LspSymbol = {
  readonly name: string;
  readonly kind: string;
  readonly container?: string;
  readonly location?: LspLocation;
};

export type LspCallHierarchyItem = {
  readonly name: string;
  readonly kind: string;
  readonly location: LspLocation;
};

/**
 * What one operation answered. `empty` is distinct from `answered` with nothing
 * in it: "the server has no definition here" and "the server was not asked"
 * are different facts, and a caller that cannot tell them apart will report a
 * missing symbol as a successful empty search.
 */
export type LspAnswer =
  | { readonly status: "answered"; readonly locations: ReadonlyArray<LspLocation> }
  | { readonly status: "symbols"; readonly symbols: ReadonlyArray<LspSymbol> }
  | { readonly status: "hover"; readonly markdown: string }
  | { readonly status: "calls"; readonly items: ReadonlyArray<LspCallHierarchyItem> }
  /** The server was asked and reported nothing. Not an error. */
  | { readonly status: "empty" };

/**
 * Every way navigation can fail, as stable codes.
 *
 * `server_exited` and `timeout` are deliberately not "no results": after either,
 * the connection state is unknown, so the next call may need a restart. Reporting
 * those as an empty answer is how a project ends up looking like it has no
 * symbols.
 */
export const LSP_FAILURE_CODES = [
  "lsp_not_configured",
  "lsp_start_failed",
  "lsp_start_denied",
  "lsp_not_initialized",
  "lsp_server_exited",
  "lsp_timeout",
  "lsp_cancelled",
  "lsp_unsupported",
  "lsp_invalid_position",
  "lsp_invalid_result",
  "lsp_limit_exceeded",
  "lsp_unsupported_transport",
] as const;

export type LspFailureCode = (typeof LSP_FAILURE_CODES)[number];

export type LspFailure = {
  readonly ok: false;
  readonly code: LspFailureCode;
  readonly message: string;
};

export type LspQueryOk = {
  readonly ok: true;
  readonly operation: LspOperation;
  readonly answer: LspAnswer;
  /** True when the answer was cut by a limit, so the caller can say so. */
  readonly truncated: boolean;
};

export type LspQueryResult = LspQueryOk | LspFailure;

/** A position to ask about, in Trylo's coordinates. */
export type LspQuery = {
  readonly operation: LspOperation;
  /** Workspace-relative; the adapter maps it to a file URI. */
  readonly path: string;
  /** 0-based line, as LSP reports. */
  readonly line: number;
  readonly character: number;
  /** Workspace-relative path for document-scoped operations (workspace symbols). */
  readonly queryText?: string;
};

/**
 * The resource ceilings for one language server connection.
 *
 * Every value has a stated consequence because every value has an over-limit
 * behaviour: an unbounded queue turns a wedged server into a memory leak, and a
 * message cap that is only checked after the whole message is allocated bounds
 * nothing. See `lsp-limits.ts` for how `maxMessageBytes` is enforced against the
 * library's reader rather than by a second JSON-RPC parser.
 */
export type LspLimits = {
  /** Wall clock for a single request, startup included. Over: `lsp_timeout`. */
  readonly requestTimeoutMs: number;
  /** Concurrent in-flight requests per server. Over: `lsp_limit_exceeded`. */
  readonly maxConcurrentRequests: number;
  /** Bytes accepted for one inbound message. Over: `lsp_limit_exceeded`. */
  readonly maxMessageBytes: number;
  /** Locations kept from one answer. Over: truncated, stated as such. */
  readonly maxLocationsPerAnswer: number;
  /** Language servers kept alive at once. Over: refused at startup. */
  readonly maxServers: number;
  /**
   * Idle milliseconds before a connection is torn down. Over: torn down
   * through the port's own `close`.
   *
   * Idle counts from the last successful `ensureStarted`, `openDocument`, or
   * `query` — no activity since then, not "no request was attempted". See
   * `lsp-limits.ts`: `dispose` cancels a pending timer only and cannot retract
   * a firing that already started, so idle expiry and explicit `close` share
   * one idempotent guarded close; there is no unified event bus (one watch per
   * decorated port).
   */
  readonly idleTtlMs: number;
};

export const DEFAULT_LSP_LIMITS: LspLimits = {
  requestTimeoutMs: 15_000,
  maxConcurrentRequests: 8,
  maxMessageBytes: 4 * 1024 * 1024,
  maxLocationsPerAnswer: 200,
  maxServers: 4,
  idleTtlMs: 300_000,
};

/**
 * How to start one language server. Identity is `(serverName, workspaceRoot)`:
 * the same server on a different root is a different connection, because a
 * language server's index is per-project and sharing one across projects would
 * silently answer about the wrong tree.
 */
export type LspServerSpec = {
  readonly serverName: string;
  readonly workspaceRoot: string;
  readonly command: string;
  readonly args: ReadonlyArray<string>;
  readonly env?: Readonly<Record<string, string>>;
  /** Capabilities the server claims, filled in by the adapter after initialize. */
  readonly capabilities?: LspServerCapabilities;
  /** Human-readable origin, for "this needs an external server installed". */
  readonly origin?: string;
};

/**
 * The subset of server capabilities Trylo consults, kept as plain data so the
 * core can ask "is this operation available?" without importing the protocol
 * package or keeping a connection alive to find out.
 */
export type LspServerCapabilities = {
  readonly definition: boolean;
  readonly references: boolean;
  readonly hover: boolean;
  readonly documentSymbol: boolean;
  readonly workspaceSymbol: boolean;
  readonly implementation: boolean;
  readonly callHierarchy: boolean;
};

export const NO_LSP_CAPABILITIES: LspServerCapabilities = {
  definition: false,
  references: false,
  hover: false,
  documentSymbol: false,
  workspaceSymbol: false,
  implementation: false,
  callHierarchy: false,
};

/**
 * The port. One owner for the process: whoever holds this is responsible for
 * starting it, terminating it, and making sure no request outlives it.
 *
 * `close` is required because an LSP connection owns a child process, and a
 * library handle with no shutdown is a leaked process on every session end.
 */
export type LanguageServerPort = {
  /** Stable identity for logs and for reuse decisions. */
  readonly serverName: string;
  readonly workspaceRoot: string;
  /**
   * Start and initialize if needed. `ok: false` carries a typed reason; a
   * server that cannot start must never be reported as "no results".
   */
  ensureStarted(): Promise<LspFailure | { readonly ok: true }>;
  /**
   * Hand the server the current text of a file, or tell it the file changed.
   *
   * This is not an optimisation. A language server resolves positions against
   * the documents it has been shown, so a query about a file it never received
   * comes back as a confident empty answer — the failure mode this method exists
   * to prevent. It must be safe to call repeatedly with the same document.
   */
  openDocument(document: LspDocument): Promise<LspFailure | { readonly ok: true }>;
  query(query: LspQuery, signal: AbortSignal): Promise<LspQueryResult>;
  /** True when a language server child process is currently held. */
  isRunning(): boolean;
  /** Terminate and release the process, settling every pending request. */
  close(): Promise<void>;
};

/** One document handed to a language server. */
export type LspDocument = {
  /** Workspace-relative, the same spelling a query uses. */
  readonly path: string;
  /** The LSP language id, e.g. `typescriptreact`. Sentences matter to servers. */
  readonly languageId: string;
  readonly text: string;
  /** Bumped on every update; servers ignore a `didChange` they cannot order. */
  readonly version?: number;
};

/**
 * The factory that decides which server answers, and whether it may start at
 * all. Starting a language server is running a program, so it goes through the
 * same authorization the shell does rather than being an automatic consequence
 * of asking a read-only question.
 */
export type LanguageServerRegistry = {
  /** Servers configured for this project, in configuration order. */
  configured(): ReadonlyArray<LspServerSpec>;
  /**
   * The server that serves `workspaceRoot`, or a typed refusal. Called on every
   * query so a configuration change takes effect without a restart.
   */
  resolveFor(workspaceRoot: string): LspFailure | { readonly ok: true; readonly spec: LspServerSpec };
};
