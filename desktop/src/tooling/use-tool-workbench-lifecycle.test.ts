import { act, renderHook, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { useToolWorkbenchLifecycle } from './use-tool-workbench-lifecycle'
import type { ToolPreviewState } from './tool-preview-state'

const mocks = vi.hoisted(() => ({ open: vi.fn(), closed: undefined as ((scope: string) => void) | undefined }))
vi.mock('../host-adapter/computer-preview-window', () => ({
  openComputerPreview: mocks.open,
  onComputerPreviewClosed: async (callback: (scope: string) => void) => { mocks.closed = callback; return () => {} },
}))
const idle: ToolPreviewState = { title: '电脑', status: '已完成', detail: '', active: false, turnId: 'one', hasTools: true }
const active = { ...idle, status: '执行中', active: true }
describe('tool workbench lifecycle', () => {
  beforeEach(() => { vi.clearAllMocks(); mocks.open.mockResolvedValue(42) })
  it('opens on a live invocation without taking focus, and does not reopen after close in the same turn', async () => {
    const showBrowser = vi.fn()
    const { result, rerender } = renderHook(({ state }) => useToolWorkbenchLifecycle({
      scope: 'task', running: true, browser: idle, computer: state, showBrowser, onError: vi.fn(),
    }), { initialProps: { state: idle } })
    expect(mocks.open).not.toHaveBeenCalled()
    rerender({ state: active })
    await waitFor(() => expect(result.current.computerVisible).toBe(true))
    expect(mocks.open).toHaveBeenCalledWith(true)
    act(() => mocks.closed?.('task'))
    expect(result.current.computerVisible).toBe(false)
    rerender({ state: { ...active, title: '下一次点击' } })
    expect(mocks.open).toHaveBeenCalledTimes(1)
    rerender({ state: { ...active, turnId: 'two' } })
    await waitFor(() => expect(mocks.open).toHaveBeenCalledTimes(2))
  })
  it('does not open historical or stopped actions; late opens cannot start a different conversation', async () => {
    let finish: ((value: number) => void) | undefined
    mocks.open.mockImplementation(() => new Promise<number>(resolve => { finish = resolve }))
    const showBrowser = vi.fn()
    const { result, rerender } = renderHook(({ running, scope }) => useToolWorkbenchLifecycle({
      scope, running, browser: active, computer: active, showBrowser, onError: vi.fn(),
    }), { initialProps: { running: false, scope: 'one' } })
    expect(mocks.open).not.toHaveBeenCalled()
    expect(showBrowser).not.toHaveBeenCalled()
    rerender({ running: true, scope: 'one' })
    expect(showBrowser).toHaveBeenCalledOnce()
    rerender({ running: false, scope: 'two' })
    await act(async () => finish?.(42))
    expect(result.current.computerVisible).toBe(false)
  })
  it('a manual reopen remains available and ignores another conversation close', async () => {
    const { result } = renderHook(() => useToolWorkbenchLifecycle({
      scope: 'one', running: false, browser: idle, computer: idle, showBrowser: vi.fn(), onError: vi.fn(),
    }))
    await act(async () => result.current.openComputer())
    expect(mocks.open).toHaveBeenCalledWith(false)
    act(() => mocks.closed?.('other'))
    expect(result.current.computerVisible).toBe(true)
  })
  it('opens fast invocations batched directly to completed and cancels a late open after close', async () => {
    let finish: ((value: number) => void) | undefined
    mocks.open.mockImplementation(() => new Promise<number>(resolve => { finish = resolve }))
    const fast = { ...idle, hasStarted: true }
    const { result } = renderHook(() => useToolWorkbenchLifecycle({
      scope: 'fast', running: true, browser: idle, computer: fast, showBrowser: vi.fn(), onError: vi.fn(),
    }))
    expect(mocks.open).toHaveBeenCalledWith(true)
    act(() => mocks.closed?.('fast'))
    await act(async () => finish?.(42))
    expect(result.current.computerVisible).toBe(false)
  })
})
