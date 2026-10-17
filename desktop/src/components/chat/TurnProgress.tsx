import type { ReactElement } from 'react'
import { Clock3 } from 'lucide-react'
import type { TurnTiming } from './types'
import { isTurnTiming } from './types'

export interface TurnProgressProps {
  readonly turnStartedAt: number | null
  /** Legacy first-response duration: never shown as whole-turn elapsed. */
  readonly finalElapsedMs?: number | null
  readonly timing?: TurnTiming
  readonly isActive: boolean
}

const LABELS: Record<TurnTiming['outcome'], string> = {
  completed: '本轮用时',
  failed: '执行失败 · 用时',
  cancelled: '已停止 · 用时',
  interrupted: '执行中断 · 用时',
}

export function TurnProgress(props: TurnProgressProps): ReactElement | null {
  const timing = props.timing
  if (props.isActive || !isTurnTiming(timing)) return null
  const seconds = Math.floor(timing.elapsedMs / 1000)
  const elapsed = `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`
  return (
    <div className="turn-progress" role="status">
      <span className="turn-progress__logo" aria-hidden="true">
        <Clock3 size={14} />
      </span>
      <span className="turn-progress__timer">
        {LABELS[timing.outcome]} {elapsed}
      </span>
    </div>
  )
}
