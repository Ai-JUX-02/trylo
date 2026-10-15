import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { RailResizer } from './RailResizer'

class TestPointerEvent extends MouseEvent {
  readonly pointerId: number
  constructor(type: string, init: PointerEventInit = {}) { super(type, init); this.pointerId = init.pointerId ?? 1 }
}
beforeEach(() => { vi.stubGlobal('PointerEvent', TestPointerEvent) })
afterEach(() => { cleanup(); vi.unstubAllGlobals() })
describe('rail pointer capture', () => {
  it('captures the drag, ignores other pointers, and restores styles after cancellation', () => {
    const onChange = vi.fn()
    render(<RailResizer side="right" width={480} min={320} max={1000} onChange={onChange} />)
    const handle = screen.getByRole('separator')
    const capture = vi.fn(), release = vi.fn()
    Object.assign(handle, { setPointerCapture: capture, hasPointerCapture: () => true, releasePointerCapture: release })
    document.body.style.cursor = 'text'
    fireEvent.pointerDown(handle, { button: 0, pointerId: 7, clientX: 800 })
    expect(capture).toHaveBeenCalledWith(7)
    fireEvent.pointerMove(window, { pointerId: 8, clientX: 200 })
    fireEvent.pointerUp(window, { pointerId: 8 })
    expect(onChange).not.toHaveBeenCalled()
    fireEvent.pointerMove(window, { pointerId: 7, clientX: 700 })
    expect(onChange).toHaveBeenLastCalledWith(580)
    fireEvent.pointerCancel(window, { pointerId: 7 })
    expect(release).toHaveBeenCalledWith(7)
    expect(document.body.style.cursor).toBe('text')
    fireEvent.pointerMove(window, { pointerId: 7, clientX: 600 })
    expect(onChange).toHaveBeenCalledTimes(1)
    document.body.style.cursor = ''
  })
  it('releases an unfinished drag on unmount', () => {
    const onChange = vi.fn()
    const { unmount } = render(<RailResizer side="right" width={480} min={320} max={1000} onChange={onChange} />)
    const handle = screen.getByRole('separator')
    Object.assign(handle, { setPointerCapture: vi.fn() })
    fireEvent.pointerDown(handle, { button: 0, pointerId: 7, clientX: 800 })
    unmount()
    fireEvent.pointerMove(window, { pointerId: 7, clientX: 700 })
    expect(onChange).not.toHaveBeenCalled()
    expect(document.body.style.userSelect).toBe('')
  })
})
