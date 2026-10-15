import { act, renderHook, waitFor } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { useComputerStream } from './use-computer-stream'
import type { ServiceManager, ServiceHealth } from '../services-host/service-manager'
import type { ToolingFacade } from './tooling-facade'

function fixture() {
  const handlers = new Map<string, (data: unknown) => void>()
  let health: (value: ServiceHealth) => void = () => {}
  const start = vi.fn(async () => ({ ok: true }))
  const stop = vi.fn(async () => ({ ok: true }))
  const ack = vi.fn(async () => ({ ok: true }))
  const manager = { currentHealth: 'starting', onHealth: (fn: typeof health) => { health = fn; return () => {} },
    client: { onEvent: (name: string, fn: (value: unknown) => void) => { handlers.set(name, fn); return () => handlers.delete(name) } },
  } as unknown as ServiceManager
  const facade = { computerPreviewStart: start, computerPreviewStop: stop, computerPreviewAck: ack } as unknown as ToolingFacade
  return { manager, facade, start, stop, ack, handlers, ready: () => health('ready') }
}
describe('computer preview stream lifecycle', () => {
  it('starts only when visible, a task enabled it and the service is ready; stops without stopping the task', async () => {
    const f = fixture(), frame = vi.fn(), status = vi.fn()
    const { rerender, unmount } = renderHook(({ enabled }) => useComputerStream({ manager: f.manager, facade: f.facade,
      projectRoot: 'D:/task', conversationId: 'one', enabled, turnId: 'turn', excludeWindow: 42 }, { frame, status }), { initialProps: { enabled: false } })
    act(() => f.ready())
    expect(f.start).not.toHaveBeenCalled()
    rerender({ enabled: true })
    await waitFor(() => expect(f.start).toHaveBeenCalledOnce())
    expect(f.start).toHaveBeenCalledWith(expect.objectContaining({ excludeWindow: 42, projectRoot: 'D:/task', conversationId: 'one' }))
    const streamId = (f.start.mock.calls[0] as unknown as [{ streamId: string }])[0].streamId
    rerender({ enabled: false })
    expect(f.stop).toHaveBeenCalledWith({ scope: '["d:/task","one"]', streamId })
    unmount()
  })
  it('rejects stale epochs, other conversations and out-of-order frames', async () => {
    const f = fixture(), frame = vi.fn(), status = vi.fn()
    renderHook(() => useComputerStream({ manager: f.manager, facade: f.facade, projectRoot: 'D:/task', conversationId: 'one', enabled: true }, { frame, status }))
    act(() => f.ready())
    await waitFor(() => expect(f.start).toHaveBeenCalledOnce())
    const streamId = (f.start.mock.calls[0] as unknown as [{ streamId: string }])[0].streamId
    const send = f.handlers.get('tooling.computerPreviewFrame')
    act(() => {
      send?.({ scope: '["d:/task","one"]', streamId: 'old', seq: 9 })
      send?.({ scope: '["d:/task","other"]', streamId, seq: 9 })
      send?.({ scope: '["d:/task","one"]', streamId, seq: 2 })
      send?.({ scope: '["d:/task","one"]', streamId, seq: 1 })
    })
    expect(frame).toHaveBeenCalledTimes(1)
    expect(frame).toHaveBeenCalledWith(expect.objectContaining({ seq: 2 }))
    await waitFor(() => expect(f.ack).toHaveBeenCalledWith(expect.objectContaining({ seq: 2, streamId })))
    expect(f.ack).toHaveBeenCalledOnce()
  })
  it('acknowledges only after the observer publication completes', async () => {
    const f = fixture(), status = vi.fn()
    let finish: (() => void) | undefined
    const frame = vi.fn(() => new Promise<void>(resolve => { finish = resolve }))
    renderHook(() => useComputerStream({ manager: f.manager, facade: f.facade, projectRoot: 'D:/task', conversationId: 'one', enabled: true }, { frame, status }))
    act(() => f.ready())
    await waitFor(() => expect(f.start).toHaveBeenCalledOnce())
    const streamId = (f.start.mock.calls[0] as unknown as [{ streamId: string }])[0].streamId
    act(() => f.handlers.get('tooling.computerPreviewFrame')?.({ scope: '["d:/task","one"]', streamId, seq: 1 }))
    expect(f.ack).not.toHaveBeenCalled()
    await act(async () => finish?.())
    await waitFor(() => expect(f.ack).toHaveBeenCalledOnce())
  })
  it('stops a failed viewer immediately and retains error status instead of acknowledging or reconnecting', async () => {
    const f = fixture(), status = vi.fn(), frame = vi.fn(async () => { throw new Error('viewer disconnected') })
    renderHook(() => useComputerStream({ manager: f.manager, facade: f.facade, projectRoot: 'D:/task', conversationId: 'one', enabled: true }, { frame, status }))
    act(() => f.ready())
    await waitFor(() => expect(f.start).toHaveBeenCalledOnce())
    const streamId = (f.start.mock.calls[0] as unknown as [{ streamId: string }])[0].streamId
    act(() => f.handlers.get('tooling.computerPreviewFrame')?.({ scope: '["d:/task","one"]', streamId, seq: 1 }))
    await waitFor(() => expect(f.stop).toHaveBeenCalledWith({ scope: '["d:/task","one"]', streamId }))
    expect(f.ack).not.toHaveBeenCalled()
    expect(status).toHaveBeenLastCalledWith(expect.objectContaining({ state: 'error', detail: 'Error: viewer disconnected' }))
    expect(f.handlers.has('tooling.computerPreviewStatus')).toBe(false)
  })
})
