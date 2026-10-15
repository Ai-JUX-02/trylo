import { afterEach, describe, expect, it, vi } from 'vitest';
import type { LoopEvent } from './loop-events';
import type { FilePath } from './types';
const readFile = vi.hoisted(() => vi.fn());
vi.mock('./index', () => ({ hostAdapter: { fs: {
  readFile, statFile: async () => ({ size: 200 }),
} } }));
import { tailTryloEvents } from './trylo-runner';

afterEach(() => { vi.useRealTimers(); readFile.mockReset(); });

describe('events-file tailing owns one cursor', () => {
  it('does not overlap slow reads or deliver the same bytes repeatedly', async () => {
    vi.useFakeTimers();
    const line = JSON.stringify({ type: 'subagent', kind: 'spawn', id: 'a', seq: 1, ts: 1 }) + '\n';
    let finish: ((text: string) => void) | undefined;
    readFile.mockImplementationOnce(() => new Promise<string>(resolve => { finish = resolve; }))
      .mockResolvedValue(line);
    const received: LoopEvent[] = [];
    const handle = tailTryloEvents({ eventsFile: '/events' as FilePath,
      intervalMs: 50, onEvents: events => received.push(...events) });
    await vi.advanceTimersByTimeAsync(250);
    const readsWhilePending = readFile.mock.calls.length;
    finish?.(line);
    await vi.advanceTimersByTimeAsync(200);
    handle.stop();
    expect(readsWhilePending).toBe(1);
    expect(received).toHaveLength(1);
  });

  it('does not deliver a read that finishes after stop', async () => {
    vi.useFakeTimers();
    let finish: ((text: string) => void) | undefined;
    readFile.mockImplementation(() => new Promise<string>(resolve => { finish = resolve; }));
    const onEvents = vi.fn();
    const handle = tailTryloEvents({ eventsFile: '/events' as FilePath, onEvents });
    await vi.advanceTimersByTimeAsync(1);
    handle.stop();
    finish?.(JSON.stringify({ type: 'subagent', kind: 'spawn', id: 'a', seq: 1, ts: 1 }) + '\n');
    await vi.advanceTimersByTimeAsync(100);
    expect(onEvents).not.toHaveBeenCalled();
  });
});
