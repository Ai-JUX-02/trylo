import { ChevronRight, PanelLeftOpen } from 'lucide-react';
import type { ReactElement, ReactNode } from 'react';

export interface TopBarProps {
  readonly workspaceName: string;
  readonly conversationTitle?: string;
  readonly collapsed: boolean;
  readonly onToggleLeftRail: () => void;
  readonly right?: ReactNode;
  readonly collaborationSwitch?: ReactNode;
}

export function TopBar(props: TopBarProps): ReactElement {
  return <header className="top-bar">
    <div className="top-bar__breadcrumb">
      {props.collapsed && <button type="button" className="top-bar__icon" onClick={props.onToggleLeftRail} aria-label="Expand rail" title="展开侧栏"><PanelLeftOpen size={17} /></button>}
      <span className="top-bar__workspace">{props.workspaceName}</span>
      <ChevronRight size={12} aria-hidden="true" />
      <span className="top-bar__title" title={props.conversationTitle}>{props.conversationTitle || '新任务'}</span>
    </div>
    <div className="top-bar__right">
      {props.collaborationSwitch}
      {props.right}
    </div>
  </header>;
}
