import type { JsonObject, JsonValue } from "../../protocol/envelope.js";

/**
 * Narrowing for frames that arrived as `unknown` (WP26 / L32).
 *
 * A control-plane frame is parsed from a socket, so everything in it is `unknown`
 * until it is checked. The alternative — casting — is the double cast this package
 * refuses: it silences exactly the check that matters, at the boundary where a
 * wrong shape is most likely.
 *
 * The depth bound is a cycle guard rather than a style choice. `JSON.parse` cannot
 * produce a cycle, but a frame can be assembled by something that did not parse,
 * and an unbounded recursion is a stack overflow waiting for one.
 */

/** Whether this unknown value is representable as JSON. */
export function isJsonValue(value: unknown, depth = 0): boolean {
  if (depth > 32) {
    return false;
  }
  if (value === null) {
    return true;
  }
  switch (typeof value) {
    case "string":
    case "boolean":
      return true;
    case "number":
      return Number.isFinite(value);
    case "object":
      break;
    default:
      // undefined, function, symbol, bigint: not representable.
      return false;
  }
  if (Array.isArray(value)) {
    return value.every((entry) => isJsonValue(entry, depth + 1));
  }
  return Object.values(value as Record<string, unknown>).every((entry) => isJsonValue(entry, depth + 1));
}

/**
 * Narrow to `JsonObject`, or `undefined`.
 *
 * An empty object is returned as-is: a payload that legitimately carries no fields
 * is a fact, not a defect, and refusing it would make `{}` indistinguishable from
 * "the daemon sent nothing", which are different situations.
 */
export function asJsonObject(value: unknown): JsonObject | undefined {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return undefined;
  }
  if (!isJsonValue(value)) {
    return undefined;
  }
  return value as JsonObject;
}

/**
 * Read one field, narrowed to a string.
 *
 * Returns `undefined` for a missing field *and* for one of the wrong type. That is
 * deliberate: a receipt that says `summary: 42` and one that omits it are both
 * "there is no summary here", and inventing an error for the first would be a
 * claim about the daemon's data that nobody needs.
 */
export function readString(source: JsonObject | undefined, key: string): string | undefined {
  const value = source?.[key];
  return typeof value === "string" ? value : undefined;
}

/** Read one field, narrowed to a finite number. Same reasoning as {@link readString}. */
export function readNumber(source: JsonObject | undefined, key: string): number | undefined {
  const value = source?.[key];
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

/** Read one field, narrowed to a JSON array. */
export function readArray(source: JsonObject | undefined, key: string): ReadonlyArray<JsonValue> | undefined {
  const value = source?.[key];
  return Array.isArray(value) ? (value as ReadonlyArray<JsonValue>) : undefined;
}

/** Read one field, narrowed to a nested object. */
export function readObject(source: JsonObject | undefined, key: string): JsonObject | undefined {
  return asJsonObject(source?.[key]);
}
