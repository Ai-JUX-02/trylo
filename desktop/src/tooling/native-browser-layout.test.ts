import { describe, expect, it, vi } from 'vitest'
import { createNativeLayoutQueue } from './native-browser-layout'
import type { NativeBrowserCommand } from '../host-adapter/native-browser'

function command(width: number, scope = 'one', visible = true): NativeBrowserCommand {
  return { scope, operation: 'layout', visible, bounds: { x: 700, y: 120, width, height: 600 } }
}
describe('native layout backpressure', () => {
  it('sends only the newest of 120 pending drag sizes when the native call is slow', async () => {
    let release: () => void = () => {}
    const send = vi.fn(async (_command: NativeBrowserCommand) => {})
    send.mockImplementationOnce(() => new Promise<void>(resolve => { release = resolve }))
    const layout = createNativeLayoutQueue(send, () => true)
    const first = layout(command(320))
    const drag = Array.from({ length: 120 }, (_, index) => layout(command(321 + index)))
    expect(send).toHaveBeenCalledTimes(1)
    release(); await Promise.all([first, ...drag])
    expect(send.mock.calls.map(([value]) => value.bounds?.width)).toEqual([320, 440])
  })
  it('keeps hide and conversation changes ordered and never shows a stale scope', async () => {
    let release: () => void = () => {}, active = 'one'
    const send = vi.fn(async (_command: NativeBrowserCommand) => {})
    send.mockImplementationOnce(() => new Promise<void>(resolve => { release = resolve }))
    const layout = createNativeLayoutQueue(send, scope => scope === active)
    const jobs = [layout(command(320)), layout(command(400)), layout(command(400, 'one', false)), layout(command(500, 'two'))]
    active = 'two'; release(); await Promise.all(jobs)
    expect(send.mock.calls.map(([value]) => [value.scope, value.visible])).toEqual([['one', true], ['one', false], ['two', true]])
  })
  it('settles all coalesced callers on failure and can apply the next size', async () => {
    let release: () => void = () => {}
    const send = vi.fn(async (_command: NativeBrowserCommand) => {})
    send.mockImplementationOnce(() => new Promise<void>(resolve => { release = resolve }))
    send.mockRejectedValueOnce(new Error('native size rejected'))
    const layout = createNativeLayoutQueue(send, () => true)
    const first = layout(command(320))
    const second = layout(command(400)), third = layout(command(500))
    const settled = Promise.allSettled([second, third])
    release(); await first
    expect((await settled).map(result => result.status)).toEqual(['rejected', 'rejected'])
    await expect(layout(command(600))).resolves.toBeUndefined()
    expect(send).toHaveBeenLastCalledWith(command(600))
  })
})
