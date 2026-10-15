import { beforeEach, expect, it, vi } from 'vitest';
import type { FilePath } from './types';

const h = vi.hoisted(() => ({ run: vi.fn() }));
vi.mock('./cli-auth-status', () => ({ runReadonlyCommand: h.run, CLI_STATUS_TIMEOUT_MS: 15_000 }));
const { readCliProviderCredential } = await import('./cli-provider-credential');
const args = { cliPath: '/cli/main.js' as FilePath, nodeProgram: '/node', providerId: 'amd', cwd: '/project' as FilePath };
beforeEach(() => { vi.clearAllMocks(); });

it('queries and validates the exact provider binding', async () => {
  h.run.mockResolvedValue({ ok: true, stdout: JSON.stringify({ id: 'amd', credential: { loggedIn: true, layer: 'user' } }) });
  await expect(readCliProviderCredential(args)).resolves.toEqual({ ok: true, loggedIn: true, layer: 'user' });
  expect(h.run).toHaveBeenCalledWith(args.cliPath, '/node', ['providers', 'config', 'amd', '--json'], 15_000, undefined, args.cwd);
});

it.each(['not-json', '{"id":"other","credential":{"loggedIn":true}}', '{"id":"amd","credential":{"loggedIn":"true"}}'])('rejects malformed or unrelated credentials without leaking raw bytes', async stdout => {
  h.run.mockResolvedValue({ ok: true, stdout });
  await expect(readCliProviderCredential(args)).resolves.toEqual({ ok: false, detail: 'invalid provider credential response' });
});

it('preserves probe failure rather than assuming authentication', async () => {
  h.run.mockResolvedValue({ ok: false, reason: 'nonzero_exit', detail: 'exit=52' });
  await expect(readCliProviderCredential(args)).resolves.toEqual({ ok: false, detail: 'exit=52' });
});
