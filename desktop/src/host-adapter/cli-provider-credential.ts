import { CLI_STATUS_TIMEOUT_MS, runReadonlyCommand } from './cli-auth-status';
import type { FilePath } from './types';

export type CliProviderCredential =
  | { readonly ok: true; readonly loggedIn: boolean; readonly layer: string }
  | { readonly ok: false; readonly detail: string };

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** Queries the exact provider binding; family status cannot prove a named account. */
export async function readCliProviderCredential(args: {
  readonly cliPath: FilePath; readonly nodeProgram?: string; readonly providerId: string;
  readonly env?: Readonly<Record<string, string>>; readonly cwd?: FilePath; readonly timeoutMs?: number;
}): Promise<CliProviderCredential> {
  const run = await runReadonlyCommand(args.cliPath, args.nodeProgram,
    ['providers', 'config', args.providerId, '--json'], args.timeoutMs ?? CLI_STATUS_TIMEOUT_MS, args.env, args.cwd);
  if (!run.ok) return { ok: false, detail: run.detail };
  try {
    const parsed: unknown = JSON.parse(run.stdout);
    if (!isRecord(parsed) || parsed.id !== args.providerId || !isRecord(parsed.credential) || typeof parsed.credential.loggedIn !== 'boolean') {
      return { ok: false, detail: 'invalid provider credential response' };
    }
    return { ok: true, loggedIn: parsed.credential.loggedIn, layer: typeof parsed.credential.layer === 'string' ? parsed.credential.layer : '' };
  } catch {
    // Never include raw credential-query bytes or launch arguments in a failure.
    return { ok: false, detail: 'invalid provider credential response' };
  }
}
