import { expect, it, vi } from 'vitest';
import type { ServiceManager } from '../services-host/service-manager';
import { ServicesClient } from '../services-host/services-client';
import { ServicesRemotePort } from './remote-port';

it('a tunnel that becomes ready after 35 seconds does not hit the ordinary 30-second RPC timeout', async () => {
  vi.useFakeTimers();
  let emit!: (event: { payload: unknown }) => void;
  let frame: { id: string } | undefined;
  const client = new ServicesClient({
    listen: async (_name, handler) => { emit = handler; return () => {}; },
    invoke: async (_name, args) => { frame = JSON.parse(String(args?.frame)); },
  });
  try {
    await client.start();
    const port = new ServicesRemotePort({ client } as ServiceManager);
    const result = port.enable({ tunnelMode: 'quick' });
    const observed = result.then(value => ({ value }));
    await vi.advanceTimersByTimeAsync(35_000);
    emit({ payload: JSON.stringify({ version: 1, type: 'response', id: frame!.id, ok: true, result: { running: true } }) });
    await expect(observed).resolves.toMatchObject({ value: { running: true } });
  } finally {
    await client.stop();
    vi.useRealTimers();
  }
});
