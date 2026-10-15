import { beforeEach, expect, it, vi } from 'vitest';
import type { SettingsForCodeRun } from '../runtime/runtime-types';

const h = vi.hoisted(() => ({ providers: vi.fn(), status: vi.fn(), credential: vi.fn() }));
vi.mock('./cli-auth-status', async importOriginal => ({
  ...await importOriginal<typeof import('./cli-auth-status')>(), readCliProviders: h.providers, readCliAuthStatus: h.status,
}));
vi.mock('./cli-provider-credential', () => ({ readCliProviderCredential: h.credential }));
const { ensureV1Connection, v1CredentialEnv } = await import('./trylo-v1-connection');
const settings = { cliPath: '/cli/main.js', cwd: '/project' } as SettingsForCodeRun;

beforeEach(() => {
  vi.clearAllMocks();
  h.providers.mockResolvedValue({ ok: true, providers: [
    { id: 'amd', kind: 'openai-compatible', auth: 'api_key' }, { id: 'openai-compatible', auth: 'api_key' },
  ] });
  h.status.mockResolvedValue({ ok: true, providers: [{ providerId: 'openai-compatible', loggedIn: true, layer: 'env' }] });
  h.credential.mockResolvedValue({ ok: true, loggedIn: true, layer: 'user' });
});

it('checks the named provider account rather than looking for its id in family status', async () => {
  await expect(ensureV1Connection(settings, { providerId: 'amd' })).resolves.toEqual({});
  expect(h.credential).toHaveBeenCalledWith(expect.objectContaining({ providerId: 'amd', cwd: '/project' }));
  expect(h.status).not.toHaveBeenCalled();
});

it('a logged-in family cannot authorize a missing named binding', async () => {
  h.credential.mockResolvedValue({ ok: true, loggedIn: false, layer: 'none' });
  await expect(ensureV1Connection(settings, { providerId: 'amd' })).rejects.toThrow(/未登录/);
});

it('uses an ephemeral builtin key for both the probe and run without resolving an undeclared model', async () => {
  const env = { TRYLO_OPENAI_API_KEY: 'test-only-key' };
  await expect(ensureV1Connection({ ...settings, apiKey: ' test-only-key ' }, { providerId: 'openai-compatible' })).resolves.toEqual(env);
  expect(h.status).toHaveBeenCalledWith(expect.objectContaining({ env }));
  expect(h.credential).not.toHaveBeenCalled();
  expect(v1CredentialEnv('amd', 'test-only-key')).toEqual({});
});

it('unknown providers fail before a task can run', async () => {
  await expect(ensureV1Connection(settings, { providerId: 'missing' })).rejects.toThrow(/未登记/);
});
