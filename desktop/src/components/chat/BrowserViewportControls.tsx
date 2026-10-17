import { useState } from 'react'
import type { NativeBrowserViewport, NativeBrowserViewportRequest } from '../../host-adapter/native-browser'

export function BrowserViewportControls({ viewport, disabled, onChange }: {
  readonly viewport?: NativeBrowserViewport
  readonly disabled: boolean
  readonly onChange: (request: NativeBrowserViewportRequest) => Promise<void>
}) {
  const mode = viewport?.mode === 'fixed' ? viewport.width === 1440 && viewport.height === 900 ? 'desktop' : viewport.width === 390 && viewport.height === 844 ? 'phone' : 'custom' : 'panel'
  const [custom, setCustom] = useState(false)
  const [width, setWidth] = useState('1440'), [height, setHeight] = useState('900')
  const [busy, setBusy] = useState(false), [error, setError] = useState('')
  const apply = async (request: NativeBrowserViewportRequest): Promise<void> => {
    setBusy(true); setError('')
    try { await onChange(request); setCustom(false) }
    catch (value) { setError(value instanceof Error ? value.message : String(value)) }
    finally { setBusy(false) }
  }
  return <div className="browser-viewport-controls">
    <div className="browser-viewport-controls__row">
      <select aria-label="页面尺寸模式" disabled={disabled || busy} value={custom ? 'custom' : mode} onChange={event => {
        const selected = event.target.value
        if (selected === 'custom') { setWidth(String(viewport?.width ?? 1440)); setHeight(String(viewport?.height ?? 900)); setCustom(true) }
        else void apply(selected === 'panel' ? { mode: 'panel' } : { mode: 'fixed', width: selected === 'desktop' ? 1440 : 390, height: selected === 'desktop' ? 900 : 844 })
      }}>
        <option value="panel">跟随面板</option><option value="desktop">桌面</option><option value="phone">手机</option><option value="custom">自定义</option>
      </select>
      <span className="browser-viewport-controls__dimensions">{viewport?.width && viewport.height ? `${viewport.width} × ${viewport.height}` : '适应当前区域'}</span>
      {viewport?.mode === 'fixed' && <span className="browser-viewport-controls__scale">展示 {Math.round(viewport.scale * 100)}%</span>}
    </div>
    {(custom || mode === 'custom') && <form className="browser-viewport-controls__custom" onSubmit={event => {
      event.preventDefault(); void apply({ mode: 'fixed', width: Number(width), height: Number(height) })
    }}><input type="number" min={1} max={16384} required aria-label="页面宽度" value={custom ? width : viewport?.width ?? width} onChange={event => { setWidth(event.target.value); if (!custom) { setHeight(String(viewport?.height ?? 900)); setCustom(true) } }} disabled={disabled || busy} />
      <span>×</span><input type="number" min={1} max={16384} required aria-label="页面高度" value={custom ? height : viewport?.height ?? height} onChange={event => { setHeight(event.target.value); if (!custom) { setWidth(String(viewport?.width ?? 1440)); setCustom(true) } }} disabled={disabled || busy} />
      <button type="submit" disabled={disabled || busy}>{busy ? '应用中' : '应用'}</button></form>}
    {error && <p role="alert" className="browser-tool-sidebar__reason">{error}</p>}
  </div>
}
