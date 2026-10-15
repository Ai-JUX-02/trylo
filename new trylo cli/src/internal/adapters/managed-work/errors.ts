/**
 * Why the managed-work control plane could not be used (WP26 / L32).
 *
 * Split out under the file-size gate, and because the error class is needed by
 * both halves of the client — the handshake (`handshake.ts`) and the request
 * lifecycle (`control-plane.ts`) — and neither should own it.
 *
 * ## Why the codes are separate
 *
 * `unauthorized` is not a flavour of `unreachable`, because they lead a person to
 * opposite actions. One means "the token in your configuration is wrong"; the
 * other means "the daemon is not running". A single "unavailable" code would
 * force a person to guess which, and guessing here means either editing a token
 * that was fine or starting a daemon that was already up.
 *
 * `refused` is separate from both because it is the *daemon's* answer: it received
 * the request and declined it, which is a fact about the request rather than about
 * the connection. A caller retrying a `refused` unchanged will get the same
 * refusal, so treating it as transient would be wrong in the other direction.
 */

/** What kind of failure this is, from a caller's point of view. */
export type ControlPlaneFailureCode =
  /** Nothing answered: not running, wrong address, or the socket could not open. */
  | "unreachable"
  /** The daemon answered and refused the token. */
  | "unauthorized"
  /** The socket was closed, by us or by the far end. */
  | "closed"
  /** The daemon received the request and declined it. */
  | "refused";

export class ControlPlaneUnavailableError extends Error {
  public readonly code: ControlPlaneFailureCode;

  constructor(code: ControlPlaneFailureCode, message: string) {
    super(message);
    this.name = "ControlPlaneUnavailableError";
    this.code = code;
  }
}

/** Whether this failure means "the backend is not there" rather than "it said no". */
export function isBackendUnreachable(error: unknown): boolean {
  return error instanceof ControlPlaneUnavailableError &&
    (error.code === "unreachable" || error.code === "closed");
}
