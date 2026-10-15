import { parseControlFrame, type ControlFrame } from './control-protocol';
import type { PermissionLevel } from '../permission/permission-policy';

/** Automatic editing still needs host decisions for commands and external tools. */
export function usesV1ApprovalTransport(level: PermissionLevel | undefined): boolean {
  return level === 'ask' || level === 'workspace_write' || level === 'unrestricted';
}

export function readV1Control(line: string): ControlFrame | null {
  try {
    return parseControlFrame(JSON.parse(line) as unknown);
  } catch {
    // The event adapter owns malformed-line diagnostics.
    return null;
  }
}
