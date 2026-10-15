/**
 * adapter 输入校验原语。
 *
 * 存在的理由：跨包 draft 可能来自 JSON/旧版本/另一包的实现，类型层不可信；
 * 每个边界都要把外部输入一次性转换成 canonical 值，且失败必须可枚举。
 *
 * 时间校验（epochMs / isIso8601）没有本地实现：严格 ISO-8601 + 日历校验的
 * 唯一权威实现在 `ports/approval-consumption.ts`（外审 P1-7 之后）。这里
 * re-export 而不是复制第二份——两份实现会漂移，2026-02-30 的归一化缺陷正是
 * 这么漏进来的（第二轮质量审计 F1）。
 */

export { epochMs, isIso8601 } from "../../ports/approval-consumption.js";

export function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

export function isStringArray(value: unknown): value is readonly string[] {
  return Array.isArray(value) && value.every((item) => typeof item === "string");
}

export function isNonEmptyStringArray(value: unknown): value is readonly string[] {
  return isStringArray(value) && value.length > 0;
}

export function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

export function isPositiveInteger(value: unknown): value is number {
  return typeof value === "number" && Number.isInteger(value) && value > 0;
}

export function isOneOf<T extends string>(
  allowed: readonly T[],
  value: unknown,
): value is T {
  return typeof value === "string" && (allowed as readonly string[]).includes(value);
}

export function isSubsetOf<T extends string>(
  allowed: readonly T[],
  values: readonly string[],
): boolean {
  const set = new Set<string>(allowed);
  return values.every((value) => set.has(value));
}

export function isPlainRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
