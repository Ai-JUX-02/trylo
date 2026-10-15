import type { Envelope } from "./envelope.js";
import { EVENT_KINDS } from "./kinds.js";

export const UNDERSTOOD_KINDS = EVENT_KINDS;

export type ConsumeResult =
  | { readonly status: "accepted"; readonly envelope: Envelope }
  | {
      readonly status: "ignored_unknown_kind";
      readonly eventId: string;
      readonly sequence: number;
      readonly kind: string;
    };

const understood = new Set<string>(UNDERSTOOD_KINDS);

export function consume(envelope: Envelope): ConsumeResult {
  if (!understood.has(envelope.kind)) {
    return {
      status: "ignored_unknown_kind",
      eventId: envelope.eventId,
      sequence: envelope.sequence,
      kind: envelope.kind,
    };
  }
  return { status: "accepted", envelope };
}
