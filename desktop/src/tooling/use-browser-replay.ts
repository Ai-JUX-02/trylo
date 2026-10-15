import { useEffect, useRef, useState } from 'react'
import { getToolResultStore } from './tool-result-store'
import type { BrowserPreviewController } from './use-browser-preview'
import type { PreviewAction, PreviewFrameGeometry, ToolPreviewState } from './tool-preview-state'
import type { BinaryRef } from './tool-result-content'

export interface BrowserReplayEntry {
  readonly src: string
  readonly receivedAt: number
  readonly url?: string
  readonly geometry?: PreviewFrameGeometry
}
export type BrowserReplay = Readonly<Record<string, BrowserReplayEntry>>
export const BROWSER_REPLAY_LIMIT = 6
// Keep original pixels. Bound retained strings rather than lowering picture quality.
export const BROWSER_REPLAY_MAX_BYTES = 12 * 1024 * 1024
const EMPTY_ACTIONS: readonly PreviewAction[] = []

export function retainBrowserReplay(previous: BrowserReplay, id: string, entry: BrowserReplayEntry, ids: readonly string[]): BrowserReplay {
  const next = Object.fromEntries(ids.slice(-BROWSER_REPLAY_LIMIT).flatMap(key => {
    const value = key === id ? entry : previous[key]
    return value ? [[key, value] as const] : []
  }))
  let size = Object.values(next).reduce((bytes, item) => bytes + item.src.length * 2, 0)
  for (const key of Object.keys(next)) {
    if (size <= BROWSER_REPLAY_MAX_BYTES) break
    size -= next[key]!.src.length * 2
    delete next[key]
  }
  return next
}

async function readSnapshot(ref: BinaryRef): Promise<string | null> {
  // Read owned bytes directly: no dependency on an object URL's revocation order.
  const bytes = await getToolResultStore().readBinaryBytes(ref)
  if (!bytes?.length || bytes.length * 8 / 3 > BROWSER_REPLAY_MAX_BYTES) return null
  return new Promise(resolve => {
    const reader = new FileReader()
    reader.onload = () => resolve(typeof reader.result === 'string' ? reader.result : null)
    reader.onerror = () => resolve(null)
    reader.readAsDataURL(new Blob([bytes as BlobPart], { type: ref.mimeType }))
  })
}

/** One sampled picture per recorded operation, retained across sidebar close/open. */
export function useBrowserReplay(state: ToolPreviewState, preview: BrowserPreviewController | undefined, scope: string): BrowserReplay {
  const owner = JSON.stringify([scope, state.turnId ?? ''])
  const ownerRef = useRef(owner)
  const generation = useRef(0)
  if (ownerRef.current !== owner) generation.current++
  ownerRef.current = owner
  const currentActions = useRef(state.actions ?? EMPTY_ACTIONS)
  currentActions.current = state.actions ?? EMPTY_ACTIONS
  const [archive, setArchive] = useState<{ owner: string; entries: BrowserReplay }>({ owner, entries: {} })
  const attempted = useRef(new Set<string>())
  useEffect(() => { attempted.current.clear(); setArchive({ owner, entries: {} }) }, [owner])

  const frame = preview?.latestFrame
  const actions = state.actions ?? EMPTY_ACTIONS
  useEffect(() => {
    if (!frame || frame.receivedAt === undefined || (frame.scope && frame.scope !== preview?.scope)) return
    const receivedAt = frame.receivedAt
    const action = [...actions].reverse().find(item => item.status !== '待执行' && item.startedAt !== undefined && item.startedAt <= receivedAt)
    if (!action || (state.settlement && action.completedAt !== undefined && receivedAt > action.completedAt + 1500)) return
    const src = `data:${frame.mimeType ?? 'image/jpeg'};base64,${frame.data}`
    setArchive(previous => {
      if (ownerRef.current !== owner) return previous
      const entries = previous.owner === owner ? previous.entries : {}
      const old = entries[action.id]
      if (old?.src === src || (old && action.completedAt !== undefined && old.receivedAt >= action.completedAt)) return previous
      const scale = frame.pageScaleFactor || 1
      return { owner, entries: retainBrowserReplay(entries, action.id, { src, receivedAt, url: frame.url ?? preview?.url,
        geometry: { width: frame.deviceWidth / scale, height: frame.deviceHeight / scale } }, actions.map(item => item.id)) }
    })
  }, [frame, actions, owner, preview?.scope, preview?.url, state.settlement])

  // Async cache reads remain valid when the next stream frame rerenders the UI.
  const imageKey = JSON.stringify(actions.map(action => [action.id, action.image?.path, action.image?.sha256]))
  useEffect(() => {
    const epoch = generation.current
    for (const action of currentActions.current) {
      if (!action.image) continue
      const key = JSON.stringify([owner, action.id, action.image.path, action.image.sha256])
      if (attempted.current.has(key)) continue
      attempted.current.add(key)
      void readSnapshot(action.image).then(src => {
        if (!src || ownerRef.current !== owner || generation.current !== epoch) return
        const ids = currentActions.current.map(item => item.id)
        if (!ids.includes(action.id)) return
        setArchive(previous => ({ owner, entries: retainBrowserReplay(previous.owner === owner ? previous.entries : {}, action.id,
          { src, receivedAt: action.completedAt ?? action.startedAt ?? 0 }, ids) }))
      }).catch(() => {})
    }
  }, [imageKey, owner])
  return archive.owner === owner ? archive.entries : {}
}

export function browserActionDuration(action: PreviewAction | undefined): string {
  const ms = action?.durationMs
  if (ms === undefined || !Number.isFinite(ms) || ms < 0) return ''
  return ms < 1000 ? `${Math.round(ms)}ms` : `${Number((ms / 1000).toFixed(1))}s`
}
