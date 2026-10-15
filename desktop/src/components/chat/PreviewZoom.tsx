import type { ReactElement } from 'react'
import { Scan, ZoomIn } from 'lucide-react'

/** Shared controls; the owner supplies the actual image or native-page zoom. */
export function PreviewZoom(props: {
  readonly value: 'fit' | number
  readonly onChange: (value: 'fit' | 1 | 2) => void
  readonly showFit?: boolean
  readonly disabled?: boolean
  readonly label?: string
}): ReactElement {
  return <div role="group" aria-label={props.label ?? '画面缩放'}>
    {props.showFit !== false && <button type="button" disabled={props.disabled} aria-pressed={props.value === 'fit'} onClick={() => props.onChange('fit')} title="适应窗口"><Scan size={13} />适应</button>}
    <button type="button" disabled={props.disabled} aria-pressed={props.value === 1} onClick={() => props.onChange(1)}>100%</button>
    <button type="button" disabled={props.disabled} aria-pressed={props.value === 2} onClick={() => props.onChange(2)}><ZoomIn size={13} />200%</button>
  </div>
}
