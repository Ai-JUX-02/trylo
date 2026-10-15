import { useState } from 'react';
import { IonIcon, IonModal } from '@ionic/react';
import { menuOutline, createOutline, closeOutline, chevronDownOutline, folderOutline, desktopOutline, settingsOutline, chatbubbleOutline, fileTrayOutline, layersOutline } from 'ionicons/icons';
import { BrandMark, uiText, type UiLanguage } from './ui';
import type { RemoteSnapshot, RemoteSurface, GatewayConnectionState } from './gateway';

export type MobileTab = 'home' | 'runs' | 'chat' | 'approvals';
interface Props {
  language: UiLanguage;
  snapshot: RemoteSnapshot | null;
  module: 'direct' | 'remote';
  tab: MobileTab;
  surface: RemoteSurface;
  connection: GatewayConnectionState;
  demo: boolean;
  busy: boolean;
  onModule: (module: 'direct' | 'remote') => void;
  onTab: (tab: MobileTab) => void;
  onProject: (id: string) => void;
  onSession: (id: string) => void;
  onNew: () => void;
  onSurface: (surface: RemoteSurface) => void;
  onSettings: () => void;
}

export default function MobileNavigation(props: Props) {
  const { language, snapshot, module, tab, surface, busy } = props;
  const [open, setOpen] = useState(false);
  const [contextOpen, setContextOpen] = useState(false);
  const activeProject = snapshot?.projects.find(project => project.id === snapshot.activeProjectId);
  const activeSession = snapshot?.sessions.find(session => session.id === snapshot.activeSessionId);
  const act = (action: () => void) => { setOpen(false); setContextOpen(false); action(); };
  return <>
    <header className="conversation-header">
      <div className="conversation-toolbar">
        <button className="nav-icon" type="button" aria-label={uiText(language, '打开项目与会话', 'Open projects and chats')} aria-expanded={open} onClick={() => setOpen(true)}><IonIcon icon={menuOutline} /></button>
        <button className="conversation-brand" type="button" aria-expanded={contextOpen} aria-label={uiText(language, '查看会话信息', 'Conversation details')} onClick={() => setContextOpen(value => !value)}><BrandMark small /><span>Trylo</span><IonIcon icon={chevronDownOutline} /></button>
        {module === 'remote' ? <button className="nav-icon" type="button" aria-label={uiText(language, '新建对话', 'New chat')} disabled={busy || !snapshot || props.connection !== 'connected'} onClick={() => act(props.onNew)}><IonIcon icon={createOutline} /></button> : <button className="nav-icon" type="button" aria-label={uiText(language, '返回远程会话', 'Remote chats')} onClick={() => props.onModule('remote')}><IonIcon icon={desktopOutline} /></button>}
      </div>
      <div className="conversation-context">{module === 'direct' ? uiText(language, '手机直连', 'Direct chat') : `${activeProject?.name || snapshot?.device.workspace || 'Trylo'} · ${surface === 'work' ? 'Work' : 'Code'}`}</div>
      {contextOpen && <section className="conversation-popover" aria-label={uiText(language, '会话信息', 'Chat details')}>
        <span>{uiText(language, '当前会话', 'Current chat')}</span><strong>{activeSession?.title || uiText(language, '新对话', 'New chat')}</strong>
        <p>{snapshot?.device.name || uiText(language, '尚未连接电脑', 'No computer connected')}</p>
        {module === 'remote' && <div className="conversation-surface" role="group" aria-label={uiText(language, '会话通道', 'Chat surface')}>
          {(['code', 'work'] as const).map(value => <button type="button" key={value} disabled={busy} aria-pressed={surface === value} onClick={() => act(() => props.onSurface(value))}>{value === 'code' ? 'Code' : 'Work'}</button>)}
        </div>}
        <button type="button" className="context-dismiss" onClick={() => setContextOpen(false)}>{uiText(language, '收起', 'Close')}</button>
      </section>}
    </header>
    <IonModal isOpen={open} onDidDismiss={() => setOpen(false)} className="navigation-drawer" aria-label={uiText(language, '项目与会话侧栏', 'Projects and chats')}>
      <aside className="navigation-body">
        <div className="navigation-heading"><span><BrandMark small />Trylo</span><button type="button" className="nav-icon" aria-label={uiText(language, '收起侧栏', 'Close sidebar')} onClick={() => setOpen(false)}><IonIcon icon={closeOutline} /></button></div>
        <button type="button" className="navigation-row" disabled={busy || props.connection !== 'connected'} onClick={() => act(() => { props.onModule('remote'); props.onNew(); })}><IonIcon icon={createOutline} />{uiText(language, '新对话', 'New chat')}</button>
        <div className="navigation-scroll">
          <p className="navigation-label">{uiText(language, '项目', 'Projects')}</p>
          {snapshot?.projects.map(project => <button type="button" className={`navigation-row${project.id === snapshot.activeProjectId ? ' is-current' : ''}`} disabled={busy || props.connection !== 'connected'} key={project.id} onClick={() => act(() => { props.onModule('remote'); props.onTab('chat'); props.onProject(project.id); })}><IonIcon icon={folderOutline} /><span>{project.name}</span></button>)}
          {!snapshot?.projects.length && <p className="navigation-empty">{uiText(language, '连接电脑后显示项目', 'Connect a computer to see projects')}</p>}
          <p className="navigation-label">{uiText(language, '最近对话', 'Recent chats')}</p>
          {snapshot?.sessions.map(session => <button type="button" className={`navigation-chat${session.id === snapshot.activeSessionId && module === 'remote' && tab === 'chat' ? ' is-current' : ''}`} disabled={busy || props.connection !== 'connected'} key={session.id} onClick={() => act(() => { props.onModule('remote'); props.onSession(session.id); })}><span>{session.title}</span>{session.surface && <small>{session.surface === 'work' ? 'Work' : 'Code'}</small>}</button>)}
        </div>
        <div className="navigation-bottom">
          <button type="button" className="navigation-row" onClick={() => act(() => { props.onModule('remote'); props.onTab('approvals'); })}><IonIcon icon={fileTrayOutline} />{uiText(language, '待处理', 'Inbox')}<span className="navigation-count">{snapshot?.approvals.length || 0}</span></button>
          <button type="button" className="navigation-row" onClick={() => act(() => { props.onModule('remote'); props.onTab('runs'); })}><IonIcon icon={layersOutline} />{uiText(language, '执行与结果', 'Activity and results')}</button>
          <button type="button" className="navigation-row" onClick={() => act(() => { props.onModule('remote'); props.onTab('home'); })}><IonIcon icon={desktopOutline} />{uiText(language, '设备与连接', 'Devices')}</button>
          <button type="button" className="navigation-row" onClick={() => act(() => props.onModule('direct'))}><IonIcon icon={chatbubbleOutline} />{uiText(language, '手机直连', 'Direct chat')}</button>
          <div className="navigation-profile"><BrandMark small /><span>{uiText(language, '我的工作台', 'My workspace')}<small>{props.demo ? uiText(language, '演示模式', 'Demo mode') : props.connection === 'connected' ? uiText(language, '已连接电脑', 'Connected') : uiText(language, '电脑离线', 'Offline')}</small></span><button type="button" className="nav-icon" aria-label={uiText(language, '设置', 'Settings')} onClick={() => act(props.onSettings)}><IonIcon icon={settingsOutline} /></button></div>
        </div>
      </aside>
    </IonModal>
  </>;
}
