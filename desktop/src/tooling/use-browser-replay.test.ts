import { act, renderHook, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { BROWSER_REPLAY_MAX_BYTES, browserActionDuration, retainBrowserReplay, useBrowserReplay } from './use-browser-replay'
import type { BrowserPreviewController } from './use-browser-preview'
import type { PreviewAction, ToolPreviewState } from './tool-preview-state'

const store = vi.hoisted(() => ({ readBinaryBytes: vi.fn() }))
vi.mock('./tool-result-store', () => ({ getToolResultStore: () => store }))
beforeEach(() => store.readBinaryBytes.mockReset())
const scope = '["d:/task","one"]'
const first: PreviewAction = { id: 'nav', title: '打开网页', target: '订单', status: '已完成', startedAt: 100, completedAt: 200, durationMs: 100 }
const second: PreviewAction = { id: 'click', title: '点击', target: '保存', status: '执行中', startedAt: 210 }
const image = { id: 'img', storage: 'ephemeral-tool-cache' as const, path: '/cache/shot.png', sha256: 'hash', size: 2, mimeType: 'image/png' }
function state(actions: readonly PreviewAction[], turnId = 'turn'): ToolPreviewState {
  return { title: '浏览器', status: actions.at(-1)?.status ?? '', detail: '', actions, turnId }
}
function preview(data: string, receivedAt: number): BrowserPreviewController {
  return { scope, status: 'running', frameSeq: receivedAt, latestFrame: { scope, data, receivedAt, mimeType: 'image/png', deviceWidth: 1440, deviceHeight: 900, pageScaleFactor: 1, url: 'https://example.com' } } as BrowserPreviewController
}

describe('browser replay production stream and cache wiring', () => {
  it('archives click/type frames without requiring screenshot tool output, keeping each step separate', async () => {
    const { result, rerender } = renderHook(({ s, p }) => useBrowserReplay(s, p, 'conversation'), {
      initialProps: { s: state([first]), p: preview('NAV', 150) },
    })
    await waitFor(() => expect(result.current.nav?.src).toContain('NAV'))
    rerender({ s: state([first, second]), p: preview('NAV', 150) })
    expect(result.current.click).toBeUndefined()
    rerender({ s: state([first, second]), p: preview('CLICK', 230) })
    await waitFor(() => expect(result.current.click?.src).toContain('CLICK'))
    expect(result.current.nav?.src).toContain('NAV')
    expect(result.current.click?.geometry).toEqual({ width: 1440, height: 900 })
    expect(store.readBinaryBytes).not.toHaveBeenCalled()
  })

  it('reads cached bytes directly and a newer action does not cancel the previous cache snapshot', async () => {
    let resolve: (bytes: Uint8Array) => void = () => {}
    store.readBinaryBytes.mockReturnValue(new Promise<Uint8Array>(done => { resolve = done }))
    const shot = { ...first, image }
    const { result, rerender } = renderHook(({ s }) => useBrowserReplay(s, undefined, 'conversation'), { initialProps: { s: state([shot]) } })
    rerender({ s: state([shot, second]) })
    await act(async () => { resolve(new Uint8Array([1, 2])) })
    await waitFor(() => expect(result.current.nav?.src).toBe('data:image/png;base64,AQI='))
    expect(result.current.click).toBeUndefined()
    expect(store.readBinaryBytes).toHaveBeenCalledTimes(1)
    expect(store.readBinaryBytes).toHaveBeenCalledWith(image)
  })

  it('discards a delayed snapshot across conversation switches, including switch away and back', async () => {
    let resolve: (bytes: Uint8Array) => void = () => {}
    store.readBinaryBytes.mockReturnValueOnce(new Promise<Uint8Array>(done => { resolve = done })).mockResolvedValue(null)
    const shot = { ...first, image }
    const { result, rerender } = renderHook(({ owner }) => useBrowserReplay(state([shot]), undefined, owner), { initialProps: { owner: 'one' } })
    rerender({ owner: 'two' })
    rerender({ owner: 'one' })
    await act(async () => { resolve(new Uint8Array([1, 2])) })
    expect(result.current).toEqual({})
  })

  it('clears frames and snapshots at a new turn and rejects another conversation stream', async () => {
    const { result, rerender } = renderHook(({ s, p }) => useBrowserReplay(s, p, 'one'), { initialProps: { s: state([first]), p: preview('NAV', 150) } })
    await waitFor(() => expect(result.current.nav).toBeTruthy())
    const other = preview('OTHER', 150)
    rerender({ s: state([first], 'new-turn'), p: { ...other, scope: 'another-scope' } })
    expect(result.current).toEqual({})
  })

  it('freezes the first observed result picture instead of replacing history with later manual browsing', async () => {
    const { result, rerender } = renderHook(({ p }) => useBrowserReplay(state([first]), p, 'one'), { initialProps: { p: preview('RESULT', 220) } })
    await waitFor(() => expect(result.current.nav?.src).toContain('RESULT'))
    rerender({ p: preview('USER-CLICK', 300) })
    expect(result.current.nav?.src).toContain('RESULT')
  })

  it('bounds original-quality pictures by count and retained string bytes', () => {
    const ids = Array.from({ length: 8 }, (_, index) => String(index))
    let archive = {}
    for (const id of ids) archive = retainBrowserReplay(archive, id, { src: `data:image/png;base64,${id}`, receivedAt: 1 }, ids.slice(0, Number(id) + 1))
    expect(Object.keys(archive)).toEqual(ids.slice(-6))
    expect(retainBrowserReplay(archive, '7', { src: 'x'.repeat(BROWSER_REPLAY_MAX_BYTES), receivedAt: 2 }, ids)).toEqual({})
  })

  it('formats actual action duration and never substitutes a gap between actions', () => {
    expect(browserActionDuration({ ...first, durationMs: 1430 })).toBe('1.4s')
    expect(browserActionDuration({ ...second, startedAt: 90000 })).toBe('')
    expect(browserActionDuration({ ...first, durationMs: -1 })).toBe('')
  })
})
