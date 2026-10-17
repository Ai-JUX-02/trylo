import { afterEach, describe, expect, it } from 'vitest'
import { cleanup, render } from '@testing-library/react'
import { applyEvents } from './events'
import { TurnProgress } from './TurnProgress'
import type { ChatMessage } from './types'
import type { LoopEvent } from '../../host-adapter/loop-events'
import { createTurnTimingObserver } from './turn-timing-observer'
import type { RuntimeResultScope } from '../../results/result-scope'

afterEach(cleanup)
const user: ChatMessage = {
  id: 'u',
  kind: 'text',
  role: 'user',
  text: 'continue',
  createdAt: 1000,
  turnStartedAt: 1000,
}
const output: LoopEvent = {
  type: 'thinking',
  seq: 1,
  ts: 18000,
  turn: 1,
  summary: 'checking',
  preview: 'checking',
  fullLength: 8,
  partial: true,
}
const end: LoopEvent = {
  type: 'loop_end',
  seq: 2,
  ts: 91000,
  durationMs: 70000,
  totalCost: 0,
  numTurns: 1,
  finalResult: 'done',
  reason: 'completed',
  isError: false,
}

describe('whole-turn timing', () => {
  it('does not settle the turn on its first reasoning delta', () => {
    expect(applyEvents([user], [output])[0]).not.toHaveProperty('finalElapsedMs')
  })
  it('settles once on terminal, including preparation and work after first output', () => {
    const messages = applyEvents([user], [output, end])
    expect(messages[0]).toMatchObject({ turnTiming: { elapsedMs: 90000, outcome: 'completed' } })
    expect(applyEvents(messages, [{ ...end, ts: 200000 }])[0]).toEqual(messages[0])
  })
  it('keeps cancellation distinct from successful completion', () => {
    expect(applyEvents([user], [{ ...end, reason: 'cancelled', isError: true }])[0]).toMatchObject({
      turnTiming: { elapsedMs: 90000, outcome: 'cancelled' },
    })
  })
  it('keeps runtime timeouts and errors distinct from a user stop', () => {
    for (const reason of ['user', 'timeout', 'error'] as const) {
      expect(applyEvents([user], [{ type: 'aborted', seq: 2, ts: 91000, reason }])[0])
        .toMatchObject({ turnTiming: { elapsedMs: 90000, outcome: reason === 'user' ? 'cancelled' : 'failed' } })
    }
  })
  it('does not show a duration next to a live user message', () => {
    const { container } = render(<TurnProgress turnStartedAt={1000} isActive />)
    expect(container.textContent).toBe('')
  })
  it('does not present an old first-output duration as whole-turn elapsed', () => {
    const { container } = render(
      <TurnProgress turnStartedAt={1000} finalElapsedMs={17000} isActive={false} />,
    )
    expect(container.textContent).not.toContain('0:17')
  })
  it('settles a crashed background turn by identity instead of stamping a newer send', () => {
    let messages: readonly ChatMessage[] = [
      user,
      { ...user, id: 'newer', createdAt: 50000, turnStartedAt: 50000 },
    ]
    const observer = createTurnTimingObserver(
      (scope, update) => {
        expect(scope.conversationId).toBe('background')
        messages = update(messages)
      },
      () => 91000,
    )
    const scope: RuntimeResultScope = {
      projectKey: 'project',
      projectRoot: 'D:/workspace',
      conversationId: 'background',
      mode: 'code',
      runId: 'run',
      turnId: 'u',
      startedAt: 1000,
    }
    observer.onRunTerminal(scope, 'exited')
    expect(messages[0]).toMatchObject({ turnTiming: { elapsedMs: 90000, outcome: 'interrupted' } })
    expect(messages[1]).not.toHaveProperty('turnTiming')
  })
})
