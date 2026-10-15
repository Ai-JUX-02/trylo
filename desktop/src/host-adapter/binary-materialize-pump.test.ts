import { afterEach, describe, expect, it, vi } from 'vitest';
import type { LoopEvent } from './loop-events';
const materialize = vi.hoisted(() => vi.fn());
vi.mock('../tooling/tool-result-store', () => ({
  materializeToolResultEvents: materialize,
  hasRawToolResultEvents: (events: readonly LoopEvent[]) => events[0]?.type === 'tool_result',
}));
import { createBinaryMaterializePump } from './binary-materialize-pump';
const binary: LoopEvent = { type: 'tool_result', seq: 1, ts: 1,
  turn: 1, id: 'call', tool: 'Read', ok: true, output: 'image', durationMs: 1 };
const text: LoopEvent = { type: 'text', seq: 2, ts: 2, turn: 1, preview: 'Done' };
const drain = async () => { for (let index = 0; index < 12; index++) await Promise.resolve(); };
afterEach(() => { materialize.mockReset(); vi.restoreAllMocks(); });

describe('ordered exactly-once materialization delivery', () => {
  it('does not let text overtake a pending binary result', async () => {
    let finish: ((events: readonly LoopEvent[]) => void) | undefined;
    materialize.mockImplementation(() => new Promise<readonly LoopEvent[]>(resolve => { finish = resolve; }));
    const batches: readonly LoopEvent[][] = [];
    const delivered: LoopEvent[][] = [];
    const pump = createBinaryMaterializePump();
    pump([binary], events => delivered.push([...events]));
    pump([text], events => delivered.push([...events]));
    await drain();
    expect(delivered).toEqual(batches);
    finish?.([binary]);
    await drain();
    expect(delivered).toEqual([[binary], [text]]);
  });

  it('never redispatches a batch when the consumer throws', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    materialize.mockResolvedValue([binary]);
    const dispatch = vi.fn(() => { throw new Error('consumer failed'); });
    createBinaryMaterializePump()([binary], dispatch);
    await drain();
    expect(dispatch).toHaveBeenCalledTimes(1);
  });
});
