import type { JsonObject, JsonValue } from "../../protocol/envelope.js";
import { ControlPlaneUnavailableError } from "./errors.js";
import { isJsonValue } from "./frame.js";
import { HANDSHAKE_PREFIX, parseFrame, performHandshake, readError } from "./handshake.js";

/**
 * The managed-work control-plane client (WP26 / L32).
 *
 * Mechanical reuse of old CLI `tools/AgentTool/managed-work/workdControlPlaneClient.ts`
 * (sha256 prefix `dec27deac5e4`, 345 lines), with two changes worth stating.
 *
 * ## Why the transport is Node's built-in `WebSocket`
 *
 * The old file imported the `ws` package. This package has no such dependency, and
 * Node 22 ships a spec-compliant `WebSocket` global — verified on this host before
 * this module was written, not assumed. Adding a dependency for a socket the
 * runtime already provides would mean a licence decision, a notice obligation and
 * a replacement path for no capability.
 *
 * ## What was verified about the far end, and when
 *
 * The wire shape is not a guess. The daemon was started in its **real** mode and
 * asked, with this exact frame shape (`{type:"req", id, method, params}`), for each
 * method the old client calls; see
 * `evidence/2026-10-07-WP26-review/workd-business.out.txt`:
 *
 * ```text
 * connect                  -> OK {"role":"operator","scopes":["admin"]}
 * workspace.list           -> OK {"workspaces":[…]}
 * managedEnvironment.list  -> OK {"environments":[…]}
 * managedSession.* (6)     -> REFUSED INVALID_PARAMS: <field> is required
 * ```
 *
 * The last line is the one that decides the design: a method that names the field
 * you forgot **exists**. So no protocol adapter is needed, and this file is a
 * transport rather than a compatibility layer.
 *
 * ## The handshake, and why it has a deadline
 *
 * The handshake is one `connect` request carrying a token. Two ways it can go wrong
 * that must not look like success: the daemon never answers, and the daemon answers
 * `UNAUTHORIZED`. Both are refusals here, and the first is bounded by a timeout —
 * a client with no deadline is a CLI that appears to freeze rather than failing.
 *
 * Some daemons send a `connect.challenge` event before expecting the handshake. The
 * old client waited 1500 ms for one and then proceeded anyway; that wait is kept,
 * because proceeding early is harmless (a daemon that expects the handshake
 * outright answers it directly) while *ignoring* a challenge that does arrive would
 * be a protocol error.
 */

export type ControlPlaneConfig = {
  /** `ws://host:port`. */
  readonly url: string;
  /** The operator token the daemon was started with. Never logged. */
  readonly token: string;
  /** Per-request deadline. */
  readonly requestTimeoutMs?: number;
  /** Deadline for the handshake itself. */
  readonly connectTimeoutMs?: number;
  /** How long to wait for a `connect.challenge` before sending the handshake anyway. */
  readonly challengeGraceMs?: number;
};

/**
 * Why the control plane could not be used.
 *
 * `unauthorized` is separate from `unreachable` because they lead a person to
 * opposite actions: one is "the token is wrong, fix the configuration", the other
 * is "the daemon is not running, start it".
 */

const DEFAULT_REQUEST_TIMEOUT_MS = 10_000;
const DEFAULT_CONNECT_TIMEOUT_MS = 10_000;
const DEFAULT_CHALLENGE_GRACE_MS = 1_500;

type Pending = {
  readonly resolve: (value: unknown) => void;
  readonly reject: (error: Error) => void;
  readonly timer: ReturnType<typeof setTimeout>;
  /** The method name, so a timeout can say which call went unanswered. */
  readonly method: string;
};



export class ManagedWorkControlPlane {
  private socket: WebSocket | null = null;
  private connecting: Promise<void> | null = null;
  private closed = false;
  private sequence = 0;
  private readonly pending = new Map<string, Pending>();
  private readonly listeners = new Map<string, Set<(payload: unknown) => void>>();

  public constructor(private readonly config: ControlPlaneConfig) {}

  /** Open the socket and complete the handshake, or explain why not. */
  async connect(): Promise<void> {
    if (this.closed) {
      throw new ControlPlaneUnavailableError("closed", "this client has been closed");
    }
    if (this.socket !== null && this.socket.readyState === 1) {
      return;
    }
    // Concurrent callers share one handshake. Two would send two `connect`
    // requests, the daemon would answer only one, and the other would sit pending
    // until its timeout — a hang caused entirely by being impatient.
    if (this.connecting !== null) {
      return this.connecting;
    }
    const attempt = this.openSocket();
    this.connecting = attempt;
    try {
      await attempt;
    } finally {
      if (this.connecting === attempt) {
        this.connecting = null;
      }
    }
  }

  /**
   * One request, one answer. Never two answers for one id, never none.
   *
   * `params` is narrowed to JSON rather than cast, because a request body is
   * assembled by the caller from data that may have come off a session — and a
   * payload carrying `undefined` would be silently dropped by `JSON.stringify` on
   * the way out, so the daemon would receive a request that is not the one the
   * caller wrote. Refusing it here says so at the call site.
   */
  async request(method: string, params: JsonValue): Promise<unknown> {
    await this.connect();
    const socket = this.socket;
    if (socket === null || socket.readyState !== 1) {
      throw new ControlPlaneUnavailableError("closed", "the control plane is not connected");
    }
    const id = this.nextId();
    const timeoutMs = this.config.requestTimeoutMs ?? DEFAULT_REQUEST_TIMEOUT_MS;
    return new Promise<unknown>((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id);
        reject(
          new ControlPlaneUnavailableError(
            "refused",
            `the control plane did not answer ${method} within ${timeoutMs}ms`,
          ),
        );
      }, timeoutMs);
      this.pending.set(id, { resolve, reject, timer, method });
      this.send({ type: "req", id, method, params });
    });
  }

  /** Subscribe to a broadcast event; returns the unsubscribe. */
  on(event: string, handler: (payload: unknown) => void): () => void {
    let handlers = this.listeners.get(event);
    if (handlers === undefined) {
      handlers = new Set();
      this.listeners.set(event, handlers);
    }
    handlers.add(handler);
    return () => {
      handlers?.delete(handler);
    };
  }

  /**
   * The socket dropped. Everything in flight fails now rather than waiting out its
   * own timeout — a caller would otherwise sit for ten seconds learning what the
   * close event said the moment it happened.
   */
  private onSocketClosed(): void {
    this.failPending(new ControlPlaneUnavailableError("closed", "the control plane connection closed"));
  }

  /** Close, and fail everything still in flight. */
  close(): void {
    this.closed = true;
    this.failPending(new ControlPlaneUnavailableError("closed", "the client was closed"));
    const socket = this.socket;
    this.socket = null;
    if (socket !== null) {
      try {
        socket.close();
      } catch {
        // Already closing.
      }
    }
  }

  /**
   * Open the socket and let the handshake module settle the connection.
   *
   * All of the ambiguity lives in `handshake.ts`; what is left here is *whose*
   * socket this is and what to tell the caller. Keeping that split is why both
   * files fit under the size gate without either one being carved up mid-method.
   */
  private async openSocket(): Promise<void> {
    let socket: WebSocket;
    try {
      socket = new WebSocket(this.config.url);
    } catch (error: unknown) {
      throw new ControlPlaneUnavailableError(
        "unreachable",
        `could not open ${this.config.url}: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
    this.socket = socket;

    // Ordinary answers are routed here regardless of the handshake's state, so a
    // daemon that answers a request sent before the handshake settled still finds
    // its waiter rather than having the frame dropped.
    socket.addEventListener("message", (event: MessageEvent) => this.routeFrame(event.data));

    return performHandshake(this.config.url, socket, {
      token: this.config.token,
      connectTimeoutMs: this.config.connectTimeoutMs ?? DEFAULT_CONNECT_TIMEOUT_MS,
      challengeGraceMs: this.config.challengeGraceMs ?? DEFAULT_CHALLENGE_GRACE_MS,
      onSettled: () => {},
      onFailed: (error) => this.failPending(error),
      send: (frame) => this.send(frame),
      registerHandshake: (id, settle, fail) => {
        const timeoutMs = this.config.connectTimeoutMs ?? DEFAULT_CONNECT_TIMEOUT_MS;
        this.pending.set(id, {
          method: "connect",
          timer: setTimeout(() => {
            this.pending.delete(id);
            fail(new ControlPlaneUnavailableError("unreachable", "the control plane did not answer the handshake"));
          }, timeoutMs),
          resolve: () => settle(),
          reject: (error: Error) => fail(error),
        });
      },
      onSocketClosed: () => this.onSocketClosed(),
      discard: (target) => {
        if (this.socket === target) {
          this.socket = null;
        }
        try {
          target.close();
        } catch {
          // Already closing.
        }
      },
    });
  }

  /**
   * Deliver one frame to whoever is waiting for it, and to any subscribers.
   *
   * A frame nobody is waiting for is still broadcast — the daemon may announce
   * `connect.success` after the handshake already completed, and a listener that
   * was waiting for that event must not depend on the connection state.
   */
  private routeFrame(data: unknown): void {
    const frame = parseFrame(data);
    if (frame === null) {
      return;
    }
    if (frame["type"] === "event") {
      this.emit(typeof frame["event"] === "string" ? frame["event"] : "", frame["payload"]);
      return;
    }
    if (frame["type"] !== "res") {
      return;
    }
    const id = typeof frame["id"] === "string" ? frame["id"] : "";
    const waiter = this.pending.get(id);
    if (waiter === undefined) {
      return;
    }
    this.pending.delete(id);
    clearTimeout(waiter.timer);
    if (frame["ok"] === true) {
      const payload = frame["payload"] ?? null;
      if (!isJsonValue(payload)) {
        waiter.reject(
          new ControlPlaneUnavailableError("refused", `${waiter.method} answered with a payload that is not JSON`),
        );
        return;
      }
      waiter.resolve(payload);
      return;
    }
    const detail = readError(frame);
    waiter.reject(
      new ControlPlaneUnavailableError("refused", `[${waiter.method}] ${detail.code}: ${detail.message}`),
    );
  }

  private failPending(error: Error): void {
    for (const waiter of this.pending.values()) {
      clearTimeout(waiter.timer);
      waiter.reject(error);
    }
    this.pending.clear();
  }

  private emit(event: string, payload: unknown): void {
    const handlers = this.listeners.get(event);
    if (handlers === undefined) {
      return;
    }
    for (const handler of Array.from(handlers)) {
      try {
        handler(payload);
      } catch {
        // One listener must not break the socket loop. Its failure is its own
        // business; the connection's business is to stay up.
      }
    }
  }

  private send(frame: JsonObject): void {
    const socket = this.socket;
    if (socket === null || socket.readyState !== 1) {
      return;
    }
    socket.send(JSON.stringify(frame));
  }

  private nextId(): string {
    this.sequence += 1;
    return this.sequence === 1 ? `${HANDSHAKE_PREFIX}1` : `w-${this.sequence.toString(36)}`;
  }
}
