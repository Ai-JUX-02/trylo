import { cleanup, render } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { TurnProgress } from './TurnProgress'
afterEach(cleanup)

describe('terminal turn duration', () => {
  it('hides live counters and legacy first-output measurements', () => {
    const view = render(<TurnProgress turnStartedAt={1000} finalElapsedMs={12000} isActive />)
    expect(view.container.textContent).toBe('')
    view.rerender(<TurnProgress turnStartedAt={1000} finalElapsedMs={12000} isActive={false} />)
    expect(view.container.textContent).toBe('')
  })
  it('shows the settled total, including a legitimate zero', () => {
    const view = render(
      <TurnProgress
        turnStartedAt={1000}
        timing={{ elapsedMs: 12000, outcome: 'completed' }}
        isActive={false}
      />,
    )
    expect(view.container.textContent).toBe('本轮用时 0:12')
    view.rerender(
      <TurnProgress
        turnStartedAt={1000}
        timing={{ elapsedMs: 0, outcome: 'completed' }}
        isActive={false}
      />,
    )
    expect(view.container.textContent).toBe('本轮用时 0:00')
  })
  it('distinguishes cancellation, failure and interrupted execution', () => {
    const view = render(
      <TurnProgress
        turnStartedAt={1000}
        timing={{ elapsedMs: 32000, outcome: 'cancelled' }}
        isActive={false}
      />,
    )
    expect(view.container.textContent).toBe('已停止 · 用时 0:32')
    view.rerender(
      <TurnProgress
        turnStartedAt={1000}
        timing={{ elapsedMs: 32000, outcome: 'failed' }}
        isActive={false}
      />,
    )
    expect(view.container.textContent).toBe('执行失败 · 用时 0:32')
    view.rerender(
      <TurnProgress
        turnStartedAt={1000}
        timing={{ elapsedMs: 32000, outcome: 'interrupted' }}
        isActive={false}
      />,
    )
    expect(view.container.textContent).toBe('执行中断 · 用时 0:32')
  })
  it('never invents elapsed time for incomplete history', () => {
    const view = render(<TurnProgress turnStartedAt={null} isActive={false} />)
    expect(view.container.textContent).toBe('')
    view.rerender(<TurnProgress turnStartedAt={1000} finalElapsedMs={null} isActive={false} />)
    expect(view.container.textContent).toBe('')
  })
})
