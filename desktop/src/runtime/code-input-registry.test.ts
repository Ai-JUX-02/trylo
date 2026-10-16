import { expect, it, vi } from 'vitest';
import { CodeInputRegistry } from './code-input-registry';
import type { LoopEvent } from '../host-adapter/loop-events';
import type { ControlInputFrame } from '../host-adapter/control-protocol';
const frame: ControlInputFrame = { kind: 'input', requestId: 'q', questions: [{ id: 'style', header: '样式', question: '选择方向', multiSelect: true,
  options: [{ label: 'A', description: '方向 A' }, { label: 'B', description: '方向 B' }] }] };
it('routes real multi-select and free text only to the originating process', async () => {
  const send = vi.fn(async (_processId: string, _line: string) => {}), events: LoopEvent[] = [];
  const registry = new CodeInputRegistry(send);
  registry.handle(frame, 'process-a', batch => events.push(...batch));
  expect(await registry.respond('q', 'submitted', { style: { optionLabels: ['A', 'B'], otherText: '更大的按钮' } })).toBe(true);
  expect(send).toHaveBeenCalledWith('process-a', expect.any(String));
  expect(JSON.parse(send.mock.calls[0]![1])).toMatchObject({ response: { request_id: 'q', response: { answers: { style: 'A, B, 更大的按钮' } } } });
  expect(events.map(e => e.type === 'input_request' ? e.status : '')).toEqual(['pending', 'submitted']);
  expect(await registry.respond('q', 'submitted', {})).toBe(false);
});
it('keeps the question available for retry when the actual input pipe fails', async () => {
  const events: LoopEvent[] = [];
  const registry = new CodeInputRegistry(async () => { throw new Error('pipe closed'); });
  registry.handle(frame, 'process-a', batch => events.push(...batch));
  expect(await registry.respond('q', 'submitted', { style: { optionLabels: ['A'] } })).toBe(false);
  expect(registry.has('q')).toBe(true); expect(events).toHaveLength(1);
});
it('a foreign process cannot retract a question and process exit makes late answers inert', async () => {
  const send = vi.fn(async () => {}), events: LoopEvent[] = [];
  const registry = new CodeInputRegistry(send);
  registry.handle(frame, 'process-a', batch => events.push(...batch));
  expect(registry.handle({ kind: 'cancel', requestId: 'q' }, 'process-b', () => {})).toBe(false);
  expect(registry.has('q')).toBe(true);
  registry.clearProcess('process-a');
  expect(await registry.respond('q', 'submitted', { style: { optionLabel: 'A' } })).toBe(false);
  expect(send).not.toHaveBeenCalled();
  expect(events.at(-1)).toMatchObject({ status: 'dismissed' });
});
