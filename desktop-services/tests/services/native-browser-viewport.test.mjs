import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createNativeViewport, viewportRequest, viewportBounds } from '../../src/tooling/native-browser-viewport.mjs';

function fixture() {
  const record = { activeLabel: 'one', zoom: 2, bounds: { x: 0, y: 0, width: 480, height: 600 } };
  let dimensions = { width: 240, height: 300 }, failures = 0;
  const calls = [];
  const owner = createNativeViewport({ record: () => record, target: () => ({ socket: 'owned' }),
    native: async (operation, params) => { calls.push({ operation, params }); if (operation === 'zoom') record.zoom = params.zoom; },
    cdp: async (_socket, method, params) => {
      if (method === 'Emulation.setDeviceMetricsOverride') {
        if (failures-- > 0) throw new Error('engine rejected metrics');
        dimensions = { width: params.width, height: params.height };
      }
      return { result: { value: dimensions } };
    } });
  return { owner, record, calls, fail: count => { failures = count; } };
}
test('fixed mode restores the existing page zoom on reset and on rejected metrics', async () => {
  const f = fixture();
  f.fail(1);
  await assert.rejects(f.owner.set('one', { mode: 'fixed', width: 1440, height: 900 }), /rejected metrics/);
  assert.equal(f.record.zoom, 2); assert.equal(f.owner.snapshot().mode, 'panel');
  await f.owner.set('one', { mode: 'fixed', width: 1440, height: 900 });
  assert.equal(f.record.zoom, 1);
  await f.owner.set('one', { mode: 'panel' });
  assert.equal(f.record.zoom, 2); assert.equal(f.owner.snapshot().width, 240);
  f.record.zoom = 3; await f.owner.sync('one');
  assert.equal(f.record.zoom, 3); assert.equal(f.owner.snapshot().width, 160);
});
test('failed rollback reports an error until the engine is successfully resynchronized', async () => {
  const f = fixture(); f.fail(2);
  await assert.rejects(f.owner.set('one', { mode: 'fixed', width: 1440, height: 900 }), /恢复均失败/);
  assert.match(f.owner.error(), /恢复均失败/);
  await f.owner.sync('one'); assert.equal(f.owner.error(), '');
});
test('dimension and display bounds validation rejects unsafe values without coercion', () => {
  for (const width of [0, -1, NaN, Infinity, 16385, '1440', 1.5]) assert.throws(() => viewportRequest({ mode: 'fixed', width, height: 900 }));
  assert.throws(() => viewportRequest({ mode: 'fixed', width: 16384, height: 16384 }));
  assert.throws(() => viewportBounds({ x: -1, y: 0, width: 480, height: 600 }));
  assert.deepEqual(viewportRequest({ mode: 'fixed', width: 390, height: 844, scale: 99, screenWidth: 999 }), { mode: 'fixed', width: 390, height: 844, deviceScaleFactor: 1, mobile: false });
});
