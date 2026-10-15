import type { ReactElement } from 'react'
import { Check, Loader2, Circle, AlertCircle } from 'lucide-react'
import type { PreviewAction } from '../../tooling/tool-preview-state'

export function PreviewActions({ actions = [] }: { readonly actions?: readonly PreviewAction[] }): ReactElement {
  return <ol className="preview-actions" aria-label="最近工具操作">
    {actions.map(action => <li key={action.id} data-status={action.status}>
      {action.status === '执行中' ? <Loader2 size={13} className="preview-actions__spin" /> : action.status === '已完成' ? <Check size={13} /> : action.status === '失败' ? <AlertCircle size={13} /> : <Circle size={13} />}
      <span><strong>{action.title}</strong>{action.target && <small title={action.target}>{action.target}</small>}</span>
      <em>{action.status}</em>
    </li>)}
  </ol>
}
