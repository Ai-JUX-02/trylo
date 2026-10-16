import { parseControlFrame, type ControlFrame } from './control-protocol';
import type { PermissionLevel } from '../permission/permission-policy';

/** Every explicit Desktop mode needs host decisions, including read-only MCP denials. */
export function usesV1ApprovalTransport(level: PermissionLevel | undefined): boolean {
  return level !== undefined;
}

export function readV1Control(line: string): ControlFrame | null {
  try {
    return parseControlFrame(JSON.parse(line) as unknown);
  } catch {
    // The event adapter owns malformed-line diagnostics.
    return null;
  }
}
