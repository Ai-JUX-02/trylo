import { cleanup, fireEvent, render, screen, act } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { PreviewImage } from './PreviewImage'
import { PreviewActivity, PreviewStreamBadge } from './PreviewActivity'
import type { PreviewAction } from '../../tooling/tool-preview-state'

class PreviewResizeObserver {
  constructor(private readonly callback: ResizeObserverCallback) {}
  observe(): void { this.callback([{ contentRect: { width: 800, height: 600 } } as ResizeObserverEntry], this as unknown as ResizeObserver) }
  unobserve(): void {}
  disconnect(): void {}
}

beforeEach(() => { vi.stubGlobal('ResizeObserver', PreviewResizeObserver) })
afterEach(() => { cleanup(); vi.useRealTimers(); vi.unstubAllGlobals() })

function loadImage(): void {
  const image = screen.getByAltText('画面')
  Object.defineProperties(image, { naturalWidth: { value: 1600 }, naturalHeight: { value: 1200 } })
  fireEvent.load(image)
}

describe('preview feedback smoke', () => {
  it('aligns physical cursor and actual click with a negative monitor origin at every zoom', () => {
    const action: PreviewAction = { id: 'click', title: '点击', status: '执行中', target: '验收按钮', startedAt: Date.now(), point: { x: -800, y: 600, space: 'screen' } }
    const { container } = render(<PreviewImage src="data:image/png;base64,AA==" alt="画面" empty="等待" action={action} frameGeometry={{ width: 1600, height: 1200, originX: -1600, originY: 0, cursorX: -1200, cursorY: 300 }} />)
    loadImage()
    const target = screen.getByLabelText('操作目标位置')
    const cursor = screen.getByLabelText('电脑指针位置')
    expect(target.style.left).toBe('50%')
    expect(target.style.top).toBe('50%')
    expect(cursor.style.left).toBe('25%')
    expect(cursor.style.top).toBe('25%')
    expect((container.querySelector('.preview-image__stage') as HTMLElement).style.width).toBe('800px')
    fireEvent.click(screen.getByText('200%'))
    expect((container.querySelector('.preview-image__stage') as HTMLElement).style.width).toBe(`${3200 / window.devicePixelRatio}px`)
    expect(target.style.left).toBe('50%')
  })

  it('never draws unknown or out-of-bounds screen coordinates', () => {
    const action: PreviewAction = { id: 'click', title: '点击', status: '执行中', target: '', point: { x: 800, y: 600, space: 'screen' } }
    const { rerender } = render(<PreviewImage src="image" alt="画面" empty="等待" action={action} />)
    loadImage()
    expect(screen.queryByLabelText('操作目标位置')).toBeNull()
    rerender(<PreviewImage src="image" alt="画面" empty="等待" action={action} frameGeometry={{ width: 100, height: 100 }} />)
    expect(screen.queryByLabelText('操作目标位置')).toBeNull()
  })

  it('uses viewport coordinates for a short-lived click marker', () => {
    vi.useFakeTimers()
    const action: PreviewAction = { id: 'browser-click', title: '点击', target: '提交', status: '执行中', startedAt: Date.now(), point: { x: 300, y: 200, space: 'viewport' } }
    render(<PreviewImage src="image" alt="画面" empty="等待" action={action} frameGeometry={{ width: 1200, height: 800 }} />)
    loadImage()
    expect(screen.getByLabelText('点击位置').style.left).toBe('25%')
    act(() => { vi.advanceTimersByTime(2001) })
    expect(screen.queryByLabelText('点击位置')).toBeNull()
  })

  it('shows tool execution separately from preserved picture state', () => {
    render(<><PreviewStreamBadge state="stopped" retained /><PreviewActivity title="点击" status="执行中" action={{ id: 'click', title: '点击', target: '验收按钮', status: '执行中' }} /></>)
    expect(screen.getByText('画面已保留')).toBeTruthy()
    expect(screen.getByText('正在点击')).toBeTruthy()
    expect(screen.getByText('验收按钮')).toBeTruthy()
    expect(screen.queryByText('实时预览')).toBeNull()
  })
})
