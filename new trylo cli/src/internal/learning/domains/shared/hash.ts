import { createHash } from "node:crypto";

export function sha256Hex(value: string): string {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

export function shortId(prefix: string, parts: readonly string[]): string {
  return `${prefix}_${sha256Hex(parts.join("\u001f")).slice(0, 16)}`;
}

export function promptHash(canonicalPrompt: string): string {
  return `ph_${sha256Hex(canonicalPrompt)}`;
}

export function canonicalJson(value: unknown): string {
  return JSON.stringify(value);
}
