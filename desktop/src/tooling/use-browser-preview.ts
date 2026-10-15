// The live browser is a native view. Images are retained only as tool evidence.
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { ServiceManager } from '../services-host/service-manager'
import type { NativeBrowserState, ViewportActionEvent, ViewportFrameEvent, ViewportInputParams, ViewportStatusEvent } from '../services-host/methods'
import { nativeBrowserCommand, nativeBrowserScope, onNativeBrowserPage, onNativeBrowserControls, type NativeBrowserBounds, type NativeBrowserCommand } from '../host-adapter/native-browser'
import type { ToolingFacade } from './tooling-facade'
import { createNativeLayoutQueue } from './native-browser-layout'

export type ViewportFrame = ViewportFrameEvent
export type ViewportStatus = ViewportStatusEvent['state']
export interface BrowserPreviewController {
  readonly scope?: string
  readonly status: ViewportStatus
  readonly detail: string
  readonly url: string
  readonly frameSeq: number
  readonly latestFrame: ViewportFrame | null
  readonly latestAction?: ViewportActionEvent
  readonly nativeState?: NativeBrowserState
  readonly zoom: number
  readonly start: () => Promise<void>
  readonly stop: () => Promise<void>
  readonly navigate: (url: string) => Promise<void>
  readonly navigation?: (operation: 'back' | 'forward' | 'reload') => Promise<void>
  readonly closeTab?: (label: string) => Promise<void>
  readonly input: (params: ViewportInputParams) => Promise<void>
  readonly setVisible: (visible: boolean) => void
  readonly setViewportSize: (size: { readonly width: number; readonly height: number }) => void
  readonly setBounds: (bounds: NativeBrowserBounds, visible: boolean) => Promise<void>
  readonly setZoom: (zoom: number) => Promise<void>
  readonly takeControl: () => Promise<void>
  readonly releaseControl: () => Promise<void>
  readonly selectTab: (label: string) => Promise<void>
  readonly createTab: () => Promise<void>
}
export function useBrowserPreview(options: {
  readonly facade: ToolingFacade | null
  readonly serviceManager: ServiceManager | null
  readonly projectRoot?: string
  readonly conversationId?: string | null
  readonly initiallyVisible?: boolean
}): BrowserPreviewController {
  const { facade, serviceManager } = options
  // Needed even with a closed sidebar: Code/Work profile resolution asks
  // Desktop to create the native browser before advertising its MCP tools.
  useEffect(() => facade?.connectNativeBridge(), [facade])
  const scope = useMemo(() => options.conversationId ? nativeBrowserScope(options.projectRoot ?? '', options.conversationId) : '', [options.projectRoot, options.conversationId])
  const scopeRef = useRef(scope); scopeRef.current = scope
  const [snapshot, setSnapshot] = useState<NativeBrowserState>()
  const [status, setStatus] = useState<ViewportStatus>('stopped')
  const [detail, setDetail] = useState('')
  const [visible, setVisible] = useState(options.initiallyVisible ?? true)
  const [ready, setReady] = useState(serviceManager?.currentHealth === 'ready')
  const [zoom, setZoomValue] = useState(1)
  const boundsRef = useRef<NativeBrowserBounds>()
  const visibleRef = useRef(visible); visibleRef.current = visible
  const generation = useRef(0)
  const snapshotRef = useRef(snapshot); snapshotRef.current = snapshot
  const layoutQueue = useRef<ReturnType<typeof createNativeLayoutQueue>>()
  if (!layoutQueue.current) layoutQueue.current = createNativeLayoutQueue(nativeBrowserCommand, requested => requested === scopeRef.current && visibleRef.current)
  const layout = useCallback((command: NativeBrowserCommand) => layoutQueue.current!(command), [])
  const apply = useCallback((state: NativeBrowserState): void => {
    if (state.scope !== scopeRef.current) return
    setSnapshot(state); setStatus(state.state); setDetail(state.detail)
  }, [])
  const fail = useCallback((error: unknown): void => {
    setStatus('error'); setDetail(error instanceof Error ? error.message : String(error))
  }, [])
  useEffect(() => {
    setReady(serviceManager?.currentHealth === 'ready')
    return serviceManager?.onHealth(health => {
      if (health !== 'ready') {
        // A previous host cannot settle the replacement host's startup.
        // Its late response/timeout still carries the same conversation.
        generation.current++
        setStatus('error'); setDetail('浏览器服务已断开')
      }
      setReady(health === 'ready')
    })
  }, [serviceManager])
  useEffect(() => {
    const off = serviceManager?.client.onEvent('tooling.nativeBrowserState', apply)
    let disposed = false, offPage = (): void => {}
    void onNativeBrowserPage(event => {
      if (event.scope !== scopeRef.current || !facade || snapshotRef.current?.scope !== event.scope) return
      void facade.nativeBrowserState(event.scope).then(apply).catch(error => { if (event.scope === scopeRef.current) fail(error) })
    }).then(unsubscribe => { if (disposed) unsubscribe(); else offPage = unsubscribe }).catch(fail)
    return () => { disposed = true; off?.(); offPage() }
  }, [serviceManager, facade, apply, fail])
  useEffect(() => {
    let disposed = false, off = (): void => {}
    void onNativeBrowserControls(event => {
      if (event.scope !== scopeRef.current) return
      if (event.error) setDetail(event.error)
      if (event.label && event.label !== snapshotRef.current?.activeLabel) return
      if (event.zoom && Number.isFinite(event.zoom)) setZoomValue(event.zoom)
      if (event.key === 'Escape') window.dispatchEvent(new Event('trylo:exit-browser-fullscreen'))
    }).then(unsubscribe => { if (disposed) unsubscribe(); else off = unsubscribe }).catch(fail)
    return () => { disposed = true; off() }
  }, [fail])
  const start = useCallback(async (): Promise<void> => {
    if (!facade || !options.conversationId || !ready) return
    const requested = scope, epoch = generation.current
    setStatus('starting'); setDetail('')
    try {
      const state = await facade.nativeBrowserOpen({ projectRoot: options.projectRoot ?? '', conversationId: options.conversationId })
      if (scopeRef.current !== requested || generation.current !== epoch) return
      apply(state)
      if (boundsRef.current) await layout({ scope: requested, operation: 'layout', bounds: boundsRef.current, visible: visibleRef.current })
    } catch (error) { if (scopeRef.current === requested && generation.current === epoch) fail(error) }
  }, [facade, options.projectRoot, options.conversationId, ready, scope, apply, fail, layout])
  useEffect(() => {
    generation.current++
    setSnapshot(undefined); setStatus('stopped'); setDetail(''); setZoomValue(1)
    return () => { if (scope) void layout({ scope, operation: 'layout', visible: false }).catch(() => {}) }
  }, [scope, layout])
  useEffect(() => { if (visible && ready && scope) void start() }, [visible, ready, scope, start])
  useEffect(() => {
    if (!scope) return
    if (!visible) void layout({ scope, operation: 'layout', visible: false }).catch(() => {})
  }, [visible, scope, layout])
  const setBounds = useCallback(async (bounds: NativeBrowserBounds, show: boolean): Promise<void> => {
    if (![bounds.x, bounds.y, bounds.width, bounds.height].every(Number.isFinite) || bounds.width < 1 || bounds.height < 1) return
    boundsRef.current = bounds
    if (!scope) return
    if (snapshotRef.current?.scope !== scope) return
    await layout({ scope, operation: 'layout', bounds, visible: show && visibleRef.current })
  }, [scope, layout])
  const stop = useCallback(async (): Promise<void> => {
    setVisible(false)
    if (scope) await layout({ scope, operation: 'layout', visible: false })
  }, [scope, layout])
  const navigate = useCallback(async (url: string): Promise<void> => {
    await nativeBrowserCommand({ scope, operation: 'navigate', url })
  }, [scope])
  const navigation = useCallback(async (operation: 'back' | 'forward' | 'reload'): Promise<void> => {
    await nativeBrowserCommand({ scope, operation })
  }, [scope])
  const closeTab = useCallback(async (label: string): Promise<void> => {
    if (!facade) throw new Error('浏览器服务尚未连接')
    await nativeBrowserCommand({ scope, operation: 'close', label })
    apply(await facade.nativeBrowserState(scope))
  }, [scope, facade, apply])
  const setZoom = useCallback(async (value: number): Promise<void> => {
    await nativeBrowserCommand({ scope, operation: 'zoom', zoom: value }); if (scopeRef.current === scope) setZoomValue(value)
  }, [scope])
  const takeControl = useCallback(async (): Promise<void> => {
    if (!facade || !scope) throw new Error('浏览器尚未连接')
    const state = await facade.nativeBrowserControl(scope, true)
    if (scopeRef.current !== scope) return
    apply(state)
    await nativeBrowserCommand({ scope, operation: 'focus' })
  }, [facade, scope, apply])
  const releaseControl = useCallback(async (): Promise<void> => {
    if (!facade || !scope) throw new Error('浏览器尚未连接')
    apply(await facade.nativeBrowserControl(scope, false))
  }, [facade, scope, apply])
  const selectTab = useCallback(async (label: string): Promise<void> => {
    if (!facade) throw new Error('浏览器服务尚未连接')
    apply(await facade.nativeBrowserSelect(scope, label))
  }, [facade, scope, apply])
  const createTab = useCallback(async (): Promise<void> => {
    if (!facade) throw new Error('浏览器服务尚未连接')
    apply(await facade.nativeBrowserCreate(scope))
  }, [facade, scope, apply])
  const input = useCallback(async (_params: ViewportInputParams): Promise<void> => {
    throw new Error('原生浏览器直接接收输入')
  }, [])
  const setViewportSize = useCallback((size: { width: number; height: number }): void => {
    const previous = boundsRef.current
    if (previous) void setBounds({ ...previous, ...size }, visibleRef.current).catch(fail)
  }, [setBounds, fail])
  return { scope, status, detail, url: snapshot?.tabs.find(tab => tab.label === snapshot.activeLabel)?.url ?? '',
    nativeState: snapshot, zoom, latestFrame: null, frameSeq: 0, start, stop, navigate, input,
    setVisible, setViewportSize, setBounds, setZoom, takeControl, releaseControl, selectTab, createTab, navigation, closeTab }
}
