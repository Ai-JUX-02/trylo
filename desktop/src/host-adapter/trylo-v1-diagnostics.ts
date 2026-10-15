import type { CliV1Rejected } from './trylo-v1-protocol';

/** Keep the root cause before remediation, with bounded transcript detail. */
export function summarizeStderr(stderr: readonly string[]): string {
  const lines = stderr.map(line => line.trim()).filter(line => line !== '');
  const joined = lines.slice(0, 5).join(' | ');
  return joined.length <= 500 ? joined : `${joined.slice(0, 500)}…`;
}

/** Raw rejected bytes may contain private model output; only describe the failure. */
export function describeV1Rejections(rejections: readonly CliV1Rejected[]): string {
  if (rejections.length === 0) return '';
  const reasons = new Map<string, number>();
  for (const rejection of rejections) {
    reasons.set(rejection.reason, (reasons.get(rejection.reason) ?? 0) + 1);
  }
  const parts = [...reasons.entries()].map(([reason, count]) => `${reason}×${count}`);
  return `${rejections.length} 行输出无法按协议解析（${parts.join(', ')}）。`;
}
