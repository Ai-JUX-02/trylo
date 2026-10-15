import type { JsonObject } from "../../protocol/envelope.js";
import { ControlPlaneUnavailableError } from "./errors.js";

/**
 * Opening the control-plane socket and completing the handshake (WP26 / L32).
 *
 * Split out of `control-plane.ts` under the file-size gate, and split on a real
 * boundary: that module is *request lifecycle* (who is waiting for what), this one
 * is *connection establishment* (getting a socket from nothing and proving the far
 * end wants to talk to us). They fail differently — a request fails per method, a
 * handshake fails once for the socket — and merging them made the handshake's
 * timers indistinguishable from the requests'.
 *
 * ## Why the handshake is worth this much care
 *
 * It is the only part of the client that can be *ambiguous*. A request either
 * answers or fails; the handshake can also hang, and a client with no deadline is
 * a CLI that appears to freeze rather than telling the person the daemon is not
 * there. So the deadline is not defensive padding — it is the difference between
 * two errors.
 */

/** The handshake's own id prefix, so its reply is distinguishable from an answer. */
export const HANDSHAKE_PREFIX = "handshake-";

/** What the socket side has to hand back for the handshake to be settled. */
export type HandshakeHooks = {
  readonly token: string;
  readonly connectTimeoutMs: number;
  readonly challengeGraceMs: number;
  /** Called once the far end has agreed to talk. */
  readonly onSettled: () => void;
  /** Called when it has not, with the reason a person can act on. */
  readonly onFailed: (error: Error) => void;
  /** Sends a request frame. */
  readonly send: (frame: JsonObject) => void;
  /** Registers the handshake request so its own reply settles the connection. */
  readonly registerHandshake: (id: string, settle: () => void, fail: (error: Error) => void) => void;
  /** Detaches the socket this handshake owns, if it is still the current one. */
  readonly discard: (socket: WebSocket) => void;
  /** Told the socket dropped, so every in-flight request can fail now. */
  readonly onSocketClosed: () => void;
};

/** Read `{code, message}` out of a frame's error field. */
export function readError(frame: Readonly<Record<string, unknown>>): { readonly code: string; readonly message: string } {
  const error = frame["error"];
  if (typeof error === "object" && error !== null) {
    const record = error as Record<string, unknown>;
    return {
      code: typeof record["code"] === "string" ? record["code"] : "unknown",
      message: typeof record["message"] === "string" ? record["message"] : "no message",
    };
  }
  return { code: "unknown", message: typeof error === "string" ? error : "no error detail" };
}

/**
 * Parse a socket payload into a frame, or `null` when it is not one.
 *
 * Binary frames are concatenated before parsing: Node delivers them as a buffer
 * list, and a message split across two of them would otherwise fail to parse and
 * be dropped — which on a response path looks exactly like a silent daemon.
 */
export function parseFrame(data: unknown): Readonly<Record<string, unknown>> | null {
  let text: string;
  if (typeof data === "string") {
    text = data;
  } else if (data instanceof ArrayBuffer) {
    text = Buffer.from(data).toString("utf8");
  } else if (Array.isArray(data)) {
    text = Buffer.concat(data as ReadonlyArray<Buffer>).toString("utf8");
  } else {
    return null;
  }
  if (text.length === 0) {
    return null;
  }
  try {
    const parsed: unknown = JSON.parse(text);
    return typeof parsed === "object" && parsed !== null && !Array.isArray(parsed)
      ? (parsed as Record<string, unknown>)
      : null;
  } catch {
    return null;
  }
}

/**
 * Open the socket and settle the handshake.
 *
 * Resolves when the far end agrees, rejects with a refusal naming what to do about
 * it. Exactly one of those happens: every path below goes through the local
 * `settled` flag, so a `connect.success` arriving after the deadline cannot
 * resolve a promise that has already rejected.
 */
export function performHandshake(url: string, socket: WebSocket, hooks: HandshakeHooks): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    let settled = false;
    let challengeTimer: ReturnType<typeof setTimeout> | null = null;
    let handshakeSent = false;

    const succeed = (): void => {
      if (settled) {
        return;
      }
      settled = true;
      clearTimeout(deadline);
      if (challengeTimer !== null) {
        clearTimeout(challengeTimer);
        challengeTimer = null;
      }
      hooks.onSettled();
      resolve();
    };
    const fail = (error: Error): void => {
      if (settled) {
        return;
      }
      settled = true;
      clearTimeout(deadline);
      if (challengeTimer !== null) {
        clearTimeout(challengeTimer);
        challengeTimer = null;
      }
      hooks.onFailed(error);
      reject(error);
    };

    // The deadline. Cleared by whichever of succeed/fail runs first, so it can
    // never fire after the handshake landed and close a socket now carrying traffic.
    const deadline = setTimeout(() => {
      fail(
        new ControlPlaneUnavailableError(
          "unreachable",
          `the control plane at ${url} did not complete the handshake within ${hooks.connectTimeoutMs}ms`,
        ),
      );
      hooks.discard(socket);
    }, hooks.connectTimeoutMs);

    const sendHandshake = (): void => {
      if (handshakeSent) {
        return;
      }
      handshakeSent = true;
      const id = `${HANDSHAKE_PREFIX}1`;
      hooks.registerHandshake(id, succeed, fail);
      hooks.send({ type: "req", id, method: "connect", params: { token: hooks.token } });
    };

    socket.addEventListener("open", () => {
      // Some daemons announce a challenge; some expect the handshake straight
      // away. The grace period covers the first without penalising the second,
      // which is the common case — a daemon that answers `connect` directly
      // ignores the extra request entirely.
      challengeTimer = setTimeout(() => {
        if (!settled) {
          sendHandshake();
        }
      }, hooks.challengeGraceMs);
    });

    socket.addEventListener("message", (event: MessageEvent) => {
      const frame = parseFrame(event.data);
      if (frame === null) {
        return;
      }
      if (frame["type"] === "event") {
        if (frame["event"] === "connect.challenge" && !settled) {
          sendHandshake();
        } else if (frame["event"] === "connect.success") {
          succeed();
        }
        return;
      }
      if (frame["type"] !== "res" || frame["ok"] === true) {
        return;
      }
      // Only a *refusal* settles the handshake here; a successful `connect` reply
      // is routed to the registered handler, which owns the success path.
      const id = typeof frame["id"] === "string" ? frame["id"] : "";
      if (!id.startsWith(HANDSHAKE_PREFIX)) {
        return;
      }
      const detail = readError(frame);
      fail(
        new ControlPlaneUnavailableError(
          detail.code === "UNAUTHORIZED" ? "unauthorized" : "refused",
          `the control plane refused the handshake: ${detail.message}`,
        ),
      );
    });

    socket.addEventListener("close", () => {
      hooks.onSocketClosed();
      if (!settled) {
        fail(new ControlPlaneUnavailableError("unreachable", "the control plane closed during the handshake"));
      }
    });

    socket.addEventListener("error", () => {
      if (!settled) {
        fail(new ControlPlaneUnavailableError("unreachable", `could not reach the control plane at ${url}`));
      }
    });
  });
}

