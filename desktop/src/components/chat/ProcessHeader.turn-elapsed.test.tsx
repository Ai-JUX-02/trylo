// Trylo Desktop — ProcessHeader turn-elapsed / turn-number tests (P0-1a, P0-1c).
//
// 2026-10-03, owner's staged UI proof (workspace `desktop-native-proof-20261003`):
//   - the status row displayed "Turn 1 · 4 tools · 336.9s" while turn 2 was in
//     flight. 336.9s was the SESSION total (last message ts − first message ts),
//     not the turn. The per-turn value was sitting in `finalElapsedMs` all along
//     (6128 / 6504 / 18722 / 16153 ms for the four turns).
//   - the row stayed "Turn 1" for all four turns: `stats.turn` came from
//     `kind:'turn'` records, and the v1 adapter stamps `turn: 1` on every event
//     it projects, so `Math.max(turn, m.turn)` could never exceed 1.
//
// These tests pin both halves against the REAL timestamps of that session.

import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { ProcessHeader } from './ProcessHeader'
import type { ChatMessage } from './types'

// Turn 1 and turn 3 of work-musqpqls-3qt7o (18:47:40.894Z / 18:53:17.760Z).
const T1_START = 1791053260894
const T3_START = 1791053597760

function user(id: string, startedAt: number, finalElapsedMs?: number): ChatMessage {
  return {
    id,
    kind: 'text',
    role: 'user',
    createdAt: startedAt,
    turnId: id,
    text: 'q',
    partial: false,
    turnStartedAt: startedAt,
    ...(finalElapsedMs === undefined
      ? {}
      : { turnTiming: { elapsedMs: finalElapsedMs, outcome: 'completed' as const } }),
  } as ChatMessage
}

function assistant(id: string, createdAt: number): ChatMessage {
  return {
    id,
    kind: 'text',
    role: 'assistant',
    createdAt,
    turnId: 'u1',
    text: 'a',
    partial: false,
  } as ChatMessage
}

// tool_running → viewStateTone = 'running' → the stats row is rendered.
const running = { running: true, viewState: 'tool_running' as const }

const twoTurns: ChatMessage[] = [
  user('u1', T1_START, 6128),
  assistant('a1', T1_START + 6128),
  user('u3', T3_START, 18722),
  assistant('a3', T3_START + 18722),
]

describe('P0-1a the status row shows the CURRENT turn elapsed', () => {
  it('A1 leaves settled durations to the end-of-turn footer', () => {
    const view = render(<ProcessHeader messages={twoTurns} {...running} />)
    // Current turn = last user message, finalElapsedMs 18722ms → "18.7s"
    expect(screen.queryByText('18.7s')).toBeNull()
    view.unmount()
  })

  it('A2 never renders the conversation total (first→last message span)', () => {
    const view = render(<ProcessHeader messages={twoTurns} {...running} />)
    // 1791053616482 − 1791053260894 = 355588ms → "355.6s" (the old, wrong value)
    expect(screen.queryByText('355.6s')).toBeNull()
    view.unmount()
  })
})

describe('P0-1c the status row numbers turns by USER turns', () => {
  const fourTurns: ChatMessage[] = [
    user('u1', 1, 100),
    assistant('a1', 2),
    user('u2', 3, 100),
    assistant('a2', 4),
    user('u3', 5, 100),
    assistant('a3', 6),
    user('u4', 7, 100),
    assistant('a4', 8),
  ]

  it('C1 shows Turn 4 on the fourth turn instead of pinning at Turn 1', () => {
    const view = render(<ProcessHeader messages={fourTurns} {...running} />)
    expect(screen.getByText('Turn 4')).toBeTruthy()
    expect(screen.queryByText('Turn 1')).toBeNull()
    view.unmount()
  })

  it('C2 does not start a second live elapsed counter', () => {
    const started = 1_700_000_000_000
    const spy = vi.spyOn(Date, 'now').mockReturnValue(started + 9000)
    try {
      const view = render(<ProcessHeader messages={[user('u1', started)]} {...running} />)
      expect(screen.queryByText('9.0s')).toBeNull()
      view.unmount()
    } finally {
      spy.mockRestore()
    }
  })
})
