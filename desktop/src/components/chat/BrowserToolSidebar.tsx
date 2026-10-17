import { useEffect, useRef, useState, type ReactElement } from 'react'
import { Globe, X, RotateCw, Maximize2, Minimize2, MousePointer2, ArrowLeft, ArrowRight, Plus, LoaderCircle, Check } from 'lucide-react'
import { PreviewImage } from './PreviewImage'
import { PreviewZoom } from './PreviewZoom'
import { BrowserViewportControls } from './BrowserViewportControls'
import type { BrowserPreviewController } from '../../tooling/use-browser-preview'
import type { PreviewAction, ToolPreviewState } from '../../tooling/tool-preview-state'
import { browserActionDuration, type BrowserReplay, type BrowserReplayEntry } from '../../tooling/use-browser-replay'
import '../../styles/components/browser-tool-sidebar.css'

function actionSentence(action: PreviewAction): string {
  return action.target.trim() ? `${action.title}『${action.target.trim()}』` : action.title
}
function siteLabel(raw: string): string {
  if (!raw || raw.startsWith('about:blank')) return '浏览器'
  try { return new URL(raw).host || raw } catch { return raw }
}
export type BrowserSidebarPhase = 'idle' | 'connecting' | 'executing' | 'done' | 'disconnected' | 'failed' | 'stopped'
export function browserSidebarPhase(state: ToolPreviewState, status: BrowserPreviewController['status'], running = state.active === true): BrowserSidebarPhase {
  if (state.settlement?.outcome === 'interrupted') return 'stopped'
  if (state.action?.status === '失败' || state.settlement?.outcome === 'failed') return 'failed'
  if (status === 'error' || (status === 'stopped' && state.hasStarted)) return 'disconnected'
  if (status === 'starting') return 'connecting'
  if (running || state.active || state.action?.status === '执行中' || state.action?.status === '待执行') return 'executing'
  if (state.hasStarted) return 'done'
  return 'idle'
}
const PHASE_LABELS: Record<BrowserSidebarPhase, string> = {
  idle: '空闲', connecting: '连接中', executing: '执行中', done: '已完成', disconnected: '预览断连', failed: '工具失败', stopped: '任务停止',
}
export function BrowserToolSidebar(props: {
  readonly state: ToolPreviewState
  readonly preview?: BrowserPreviewController
  readonly replay?: BrowserReplay
  readonly width: number
  readonly running?: boolean
  readonly fullscreen?: boolean
  readonly suspended?: boolean
  readonly onToggleFullscreen?: () => void
  readonly onClose: () => void
}): ReactElement {
  const { preview } = props
  const native = preview?.nativeState
  const nativeScope = native?.scope
  const phase = browserSidebarPhase(props.state, preview?.status ?? 'stopped', props.running)
  const pictureRef = useRef<HTMLDivElement>(null)
  const [historyOpen, setHistoryOpen] = useState(false)
  const [error, setError] = useState('')
  const [copied, setCopied] = useState(false)
  const [addressDraft, setAddressDraft] = useState<string>()
  const copyTimer = useRef<ReturnType<typeof setTimeout>>()
  const mounted = useRef(true)
  const owner = JSON.stringify([preview?.scope, props.state.turnId])
  const [selected, setSelected] = useState<{ owner: string; action: PreviewAction; entry: BrowserReplayEntry }>()
  const replay = selected?.owner === owner ? selected : undefined
  const replaying = !!replay
  const current = props.state.action ?? props.state.actions?.at(-1)
  const history = props.state.actions ?? []
  const rawAddress = replay ? replay.entry.url ?? '' : preview?.url || props.state.url || ''
  const address = rawAddress.startsWith('about:blank#trylo-native-') ? '' : rawAddress
  const failure = [...history].reverse().find(action => action.status === '失败')
  const reason = failure?.error || (phase === 'failed' ? props.state.detail : '')
  const displayReason = reason && reason !== '工具返回截图后会显示在这里。' ? reason : phase === 'failed' ? '工具未返回失败原因。' : ''
  const connected = preview?.status === 'running' && !!native
  const agentActive = connected && !replaying && native?.control !== 'user' && ((native?.inFlight ?? 0) > 0 || current?.status === '执行中' || current?.status === '待执行')
  const [now, setNow] = useState(Date.now)
  useEffect(() => {
    if (!agentActive || !current?.startedAt) return
    setNow(Date.now())
    const timer = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(timer)
  }, [agentActive, current?.startedAt])
  const navigateAddress = async (): Promise<void> => {
    const raw = (addressDraft ?? address).trim()
    if (!raw || !preview) return
    const explicit = raw.includes('://') || /^(about|file|data):/i.test(raw)
    const local = /^(localhost|127\.0\.0\.1|\[::1\])([:/]|$)/i.test(raw)
    const url = explicit ? raw : `${local ? 'http' : 'https'}://${raw}`
    await preview.navigate(url); setAddressDraft(undefined)
  }
  const setBounds = preview?.setBounds
  useEffect(() => {
    mounted.current = true
    return () => { mounted.current = false; clearTimeout(copyTimer.current) }
  }, [])
  const run = async (operation: () => Promise<void>): Promise<void> => {
    setError('')
    try { await operation() } catch (value) { if (mounted.current) setError(value instanceof Error ? value.message : String(value)) }
  }
  useEffect(() => {
    const box = pictureRef.current
    if (!box || !setBounds || !nativeScope) return
    let disposed = false, frame = 0, last = ''
    const report = (): void => {
      cancelAnimationFrame(frame)
      frame = requestAnimationFrame(() => {
        const rect = box.getBoundingClientRect()
        if (rect.width < 1 || rect.height < 1) return
        const show = connected && !replaying && !props.suspended
        const key = JSON.stringify([rect.left, rect.top, rect.width, rect.height, show])
        if (key === last) return
        last = key
        void setBounds({ x: rect.left, y: rect.top, width: rect.width, height: rect.height }, show)
          .catch(value => { if (!disposed) setError(value instanceof Error ? value.message : String(value)) })
      })
    }
    report()
    const observer = new ResizeObserver(report); observer.observe(box)
    window.addEventListener('resize', report)
    return () => { disposed = true; observer.disconnect(); window.removeEventListener('resize', report); cancelAnimationFrame(frame) }
  }, [setBounds, connected, nativeScope, replaying, props.suspended, props.fullscreen, historyOpen])
  useEffect(() => () => {
    const rect = pictureRef.current?.getBoundingClientRect()
    if (rect && setBounds) void setBounds({ x: rect.left, y: rect.top, width: Math.max(1, rect.width), height: Math.max(1, rect.height) }, false).catch(() => {})
  }, [setBounds])
  const showReplay = (action: PreviewAction): void => {
    const entry = props.replay?.[action.id]
    if (entry) setSelected({ owner, action, entry })
  }
  const copyAddress = async (): Promise<void> => {
    await navigator.clipboard.writeText(address)
    if (!mounted.current) return
    setCopied(true); clearTimeout(copyTimer.current)
    copyTimer.current = setTimeout(() => setCopied(false), 1600)
  }
  const controlLabel = !connected ? phase === 'connecting' ? '正在连接' : '等待网页' : native?.control === 'user' ? '你已接管' : native?.control === 'pending' ? '等待当前操作结束' : agentActive || props.running ? '智能体操作' : '可直接操作'
  const waitingForUser = native?.control === 'user' && current?.status === '执行中'
  const empty = phase === 'connecting' ? '正在连接浏览器' : phase === 'disconnected' ? '浏览器连接已断开' : '等待打开网页'
  return <aside className="browser-tool-sidebar" data-phase={phase} data-fullscreen={props.fullscreen || undefined} style={{ width: props.fullscreen ? undefined : props.width }} aria-label="浏览器侧栏">
    <header className="browser-tool-sidebar__head">
      <div className="browser-tool-sidebar__site-row">
        <Globe size={16} aria-hidden="true" />
        <span className="browser-tool-sidebar__site" title={address || undefined}>{siteLabel(address)}</span>
        <span className="browser-tool-sidebar__phase" data-phase={phase}>{PHASE_LABELS[phase]}</span>
        {preview && !connected && <button type="button" className="browser-tool-sidebar__icon-button" aria-label="重新连接浏览器" onClick={() => void run(preview.start)}><RotateCw size={15} /></button>}
        {props.onToggleFullscreen && <button type="button" className="browser-tool-sidebar__icon-button" aria-label={props.fullscreen ? '退出浏览器全屏' : '浏览器全屏'} aria-pressed={props.fullscreen ?? false} onClick={props.onToggleFullscreen}>{props.fullscreen ? <Minimize2 size={15} /> : <Maximize2 size={15} />}</button>}
        <button type="button" className="browser-tool-sidebar__icon-button" aria-label="收起浏览器侧栏" onClick={props.onClose}><X size={16} /></button>
      </div>
      <div className="browser-tool-sidebar__action-row" data-live={agentActive || phase === 'connecting' || undefined} role="status" aria-live="polite">
        <div className="browser-tool-sidebar__activity-icon" aria-hidden="true">{agentActive || phase === 'connecting' ? <LoaderCircle size={18} /> : phase === 'done' ? <Check size={18} /> : <MousePointer2 size={18} />}</div>
        <div className="browser-tool-sidebar__action-copy"><span className="browser-tool-sidebar__owner" data-owner={native?.control}>{replaying ? '历史画面' : controlLabel}</span>
          <strong>{replay ? `回看：${actionSentence(replay.action)}` : waitingForUser ? '等待交回控制权' : current ? `${current.status === '执行中' ? '正在' : ''}${actionSentence(current)}` : empty}</strong></div>
        {agentActive && current?.startedAt ? <small aria-hidden="true" title="本次操作已用时">{Math.max(0, Math.floor((now - current.startedAt) / 1000))} 秒</small> : browserActionDuration(replay?.action ?? current) && <small title="该次操作耗时">{browserActionDuration(replay?.action ?? current)}</small>}
        {current?.stepIndex && props.state.stepCount ? <small title="操作序号">{current.stepIndex}/{props.state.stepCount}</small> : null}
        {address && <button type="button" onClick={() => void run(copyAddress)}>{copied ? '已复制' : '地址'}</button>}
        {!replaying && current && props.replay?.[current.id] && <button type="button" onClick={() => showReplay(current)}>画面</button>}
      </div>
      {displayReason && <p className="browser-tool-sidebar__reason" role="alert">{displayReason}</p>}
      {preview?.status === 'error' && preview.detail && <p className="browser-tool-sidebar__reason" role="alert">{preview.detail}</p>}
      {preview?.status !== 'error' && preview?.detail && <p className="browser-tool-sidebar__reason" role="alert">{preview.detail}</p>}
      {!replaying && props.running && native?.control === 'user' && <p className="browser-tool-sidebar__control-note" role="status">浏览器操作已暂停；智能体仍在运行。</p>}
      {error && <p className="browser-tool-sidebar__reason" role="alert">{error}</p>}
    </header>
    {!replaying && preview && <form className="browser-tool-sidebar__address" onSubmit={event => { event.preventDefault(); void run(navigateAddress) }}>
      <button type="button" className="browser-tool-sidebar__icon-button" aria-label="网页后退" disabled={!connected || !preview.navigation} onClick={() => void run(() => preview.navigation!('back'))}><ArrowLeft size={14} /></button>
      <button type="button" className="browser-tool-sidebar__icon-button" aria-label="网页前进" disabled={!connected || !preview.navigation} onClick={() => void run(() => preview.navigation!('forward'))}><ArrowRight size={14} /></button>
      <button type="button" className="browser-tool-sidebar__icon-button" aria-label="刷新网页" disabled={!connected || !preview.navigation} onClick={() => void run(() => preview.navigation!('reload'))}><RotateCw size={14} /></button>
      <input aria-label="网页地址" type="text" spellCheck={false} placeholder="输入网址" value={addressDraft ?? address} disabled={!connected} onChange={event => setAddressDraft(event.target.value)} onBlur={() => setAddressDraft(undefined)} />
    </form>}
    {!replaying && native && <div className="browser-tool-sidebar__tabs" role="tablist" aria-label="浏览器标签页">
      {native.tabs.map(tab => <div className="browser-tool-sidebar__tab" key={tab.id}><button type="button" role="tab" aria-selected={tab.label === native.activeLabel} title={tab.url} onClick={() => void run(() => preview!.selectTab(tab.label))}>{tab.title}</button>
        {preview?.closeTab && <button type="button" className="browser-tool-sidebar__close-tab" aria-label={`关闭标签页：${tab.title}`} onClick={() => void run(() => preview.closeTab!(tab.label))}><X size={12} /></button>}</div>)}
      <button type="button" className="browser-tool-sidebar__new-tab" aria-label="新建浏览器标签页" onClick={() => void run(preview!.createTab)}><Plus size={14} /></button>
    </div>}
    {!replaying && preview && native && <BrowserViewportControls key={`${native.scope}:${native.activeLabel}`} viewport={native.viewport}
      disabled={!connected || native.inFlight > 0 || !preview.setPageViewport}
      onChange={request => preview.setPageViewport!(request)} />}
    <div className="browser-tool-sidebar__picture" ref={pictureRef} data-native={!replaying || undefined}>
      {replay ? <PreviewImage src={replay.entry.src} alt={`第 ${replay.action.stepIndex ?? ''} 项操作的历史画面`} empty="历史画面不可用" frameGeometry={replay.entry.geometry} />
        : !connected ? <div className="browser-tool-sidebar__empty"><Globe size={30} strokeWidth={1.25} /><span>{empty}</span></div>
          : native?.tabs.find(tab => tab.label === native.activeLabel)?.popup ? <div className="browser-tool-sidebar__empty"><Globe size={30} strokeWidth={1.25} /><span>此页面已在浏览器窗口中打开</span></div> : null}
    </div>
    <div className="browser-tool-sidebar__controls">
      {replaying ? <button type="button" className="browser-tool-sidebar__control" onClick={() => setSelected(undefined)}><ArrowLeft size={14} />回到实时</button>
        : <>
          <button type="button" className="browser-tool-sidebar__control" disabled={!connected} onClick={() => void run(native?.control === 'agent' ? preview!.takeControl : preview!.releaseControl)}>{native?.control === 'user' ? '交回智能体' : native?.control === 'pending' ? '取消接管' : '我接管'}</button>
          {native?.viewport?.mode === 'fixed' ? <span className="browser-viewport-controls__scale">适应展示 · 页面 100%</span>
            : <div className="browser-tool-sidebar__zoom"><PreviewZoom value={preview?.zoom ?? 1} onChange={value => { if (value !== 'fit') void run(() => preview!.setZoom(value)) }} showFit={false} disabled={!connected} label="网页缩放" /></div>}
        </>}
    </div>
    <footer className="browser-tool-sidebar__history">
      <button type="button" className="browser-tool-sidebar__history-toggle" aria-expanded={historyOpen} onClick={() => setHistoryOpen(open => !open)}><span>最近操作 <strong>{history.length}</strong></span><span>{historyOpen ? '收起' : '展开'}</span></button>
      {historyOpen && history.length > 0 && <ol className="browser-tool-sidebar__history-list" aria-label="最近工具操作">
        {history.map((action, index) => <li key={action.id} data-status={action.status}>
          {props.replay?.[action.id] ? <button type="button" aria-pressed={replay?.action.id === action.id} onClick={() => showReplay(action)}>{action.stepIndex ?? index + 1}. {actionSentence(action)}</button> : <span>{action.stepIndex ?? index + 1}. {actionSentence(action)}</span>}
          <small>{action.status} {browserActionDuration(action)}</small>
          {action.error && <p>{action.error}</p>}
        </li>)}
      </ol>}
    </footer>
  </aside>
}
