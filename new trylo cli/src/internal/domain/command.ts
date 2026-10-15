import type { JsonObject } from "../protocol/envelope.js";

export type EffectCommand =
  | {
      readonly type: "stream_provider";
      readonly attemptId: string;
      readonly idempotencyKey: string;
    }
  | {
      readonly type: "cancel_provider";
      readonly attemptId: string;
      readonly idempotencyKey: string;
    }
  | {
      readonly type: "request_permission";
      readonly toolCallId: string;
      readonly ticketId: string;
      readonly name: string;
      readonly idempotencyKey: string;
    }
  | {
      readonly type: "execute_tool";
      readonly toolCallId: string;
      readonly idempotencyKey: string;
    }
  | {
      readonly type: "cancel_tool";
      readonly toolCallId: string;
      readonly idempotencyKey: string;
    }
  | {
      readonly type: "emit";
      readonly kind: string;
      readonly payload: JsonObject;
      readonly idempotencyKey: string;
    };

export type DomainEvent = {
  readonly kind: string;
  readonly payload: JsonObject;
};
