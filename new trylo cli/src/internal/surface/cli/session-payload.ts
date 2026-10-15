import type { JsonObject } from "../../protocol/envelope.js";

/** Canonical values cross the JSON write boundary once, without a double cast. */
export function sessionPayload(value: unknown): JsonObject {
  return JSON.parse(JSON.stringify(value)) as JsonObject;
}
