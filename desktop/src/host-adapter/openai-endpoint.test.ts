// @vitest-environment node
import { expect, it, vi } from 'vitest';
vi.mock('./index', () => ({ hostAdapter: {} }));
import { providerArgsFor } from './cli-auth-status';

it.each([
  ['https://developer.amd.com.cn/radeon/api/v1', 'https://developer.amd.com.cn/radeon/api/v1/chat/completions'],
  ['https://example.com/v1/', 'https://example.com/v1/chat/completions'],
  ['https://example.com', 'https://example.com/v1/chat/completions'],
  ['https://example.com/proxy/v2?tenant=test', 'https://example.com/proxy/v2/chat/completions?tenant=test'],
  ['https://example.com/v1/chat/completions', 'https://example.com/v1/chat/completions'],
])('maps Desktop API base %s to the new CLI request URL', (apiHost, endpoint) => {
  expect(providerArgsFor({ apiFormat: 'openai', apiHost }).endpoint).toBe(endpoint);
});

it('uses the same API-base contract for a named OpenAI-compatible provider', () => {
  expect(providerArgsFor({ providerId: 'amd', apiFormat: 'openai', apiHost: 'https://example.com/v1' }))
    .toEqual({ providerId: 'amd', endpoint: 'https://example.com/v1/chat/completions' });
});

it('does not rewrite another protocol or an omitted endpoint', () => {
  expect(providerArgsFor({ apiFormat: 'anthropic', apiHost: 'https://example.com' }).endpoint).toBe('https://example.com');
  expect(providerArgsFor({ apiFormat: 'openai', apiHost: ' ' }).endpoint).toBeUndefined();
});

it('rejects an invalid API base before sending a request without echoing its value', () => {
  expect(() => providerArgsFor({ apiFormat: 'openai', apiHost: 'secret-invalid-url' })).toThrow('API host');
  expect(() => providerArgsFor({ apiFormat: 'openai', apiHost: 'file:///local' })).toThrow('API host');
});
