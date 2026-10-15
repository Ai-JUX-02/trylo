import { IonIcon } from '@ionic/react';
import { useEffect, useState } from 'react';
import { checkmarkOutline, chevronForwardOutline, documentTextOutline, terminalOutline, createOutline, pauseOutline, closeOutline, stopOutline } from 'ionicons/icons';
import type { RemoteChatMessage, RemoteSnapshot, TimelineEvent } from './gateway';
import { BrandMark, MarkdownMessage, uiText, type UiLanguage } from './ui';

export function ProcessMessage({ message, language }: { message: RemoteChatMessage; language: UiLanguage }) {
  const thinking = message.role === 'thinking';
  const state = message.status || 'done';
  const icon = state === 'error' ? closeOutline : state === 'interrupted' ? stopOutline : state === 'streaming' ? pauseOutline : checkmarkOutline;
  const label = state === 'error' ? uiText(language, '失败', 'Failed') : state === 'interrupted' ? uiText(language, '中断', 'Interrupted') : state === 'streaming' ? uiText(language, '进行中', 'Running') : uiText(language, '完成', 'Done');
  let target = '';
  let input = message.input;
  if (input) { try { const value = JSON.parse(input); target = String(value.file_path || value.path || value.command || value.pattern || ''); input = JSON.stringify(value, null, 2); } catch { /* Legacy tool text remains readable. */ } }
  return <details className={`process-event${state === 'error' ? ' process-event--error' : ''}`}>
    <summary><IonIcon className="process-chevron" icon={chevronForwardOutline} />{!thinking && <IonIcon icon={/bash|shell|command/i.test(message.title || '') ? terminalOutline : /edit|write|patch/i.test(message.title || '') ? createOutline : documentTextOutline} />}<span className="process-event-title">{message.title || (thinking ? uiText(language, '思考过程', 'Thinking') : 'Tool')}{target && <small className="process-target">{target}</small>}</span>{thinking ? <small>{uiText(language, '思考', 'Thinking')}</small> : <span className="process-event-state"><IonIcon icon={icon} />{label}</span>}</summary>
    <div className="process-event-body">
      {thinking ? <MarkdownMessage text={message.text} language={language} /> : <>
        {input !== undefined && <><span>{uiText(language, '输入', 'Input')}</span><pre><code>{input}</code></pre></>}
        {message.output !== undefined && <><span>{uiText(language, state === 'error' ? '错误' : '结果', state === 'error' ? 'Error' : 'Output')}</span><pre><code>{message.output || uiText(language, '无文本输出', 'No text output')}</code></pre></>}
        {message.input === undefined && message.output === undefined && <p>{message.text || uiText(language, '电脑未提供详细内容', 'No details from the computer')}</p>}
        {message.durationMs !== undefined && <small>{(message.durationMs / 1000).toFixed(1)} s</small>}
      </>}
    </div>
  </details>;
}

export default function RemoteEventStream({ snapshot, language, showEvents = true, onApproval }: { snapshot: RemoteSnapshot; language: UiLanguage; showEvents?: boolean; onApproval: (id: string) => void }) {
  const { agent, approvals } = snapshot;
  const stopped = agent.phase === 'stopped';
  const settled = stopped || agent.status === 'done' || agent.status === 'failed';
  const [, tick] = useState(0);
  const ticking = !settled && agent.status !== 'idle' && agent.elapsedMs != null;
  useEffect(() => { if (!ticking) return; const timer = window.setInterval(() => tick(value => value + 1), 1000); return () => window.clearInterval(timer); }, [ticking]);
  const elapsedMs = agent.elapsedMs == null ? null : Math.max(0, agent.elapsedMs + (ticking ? Math.max(0, Date.now() - snapshot.device.lastSeenAt) : 0));
  const seconds = Math.floor((elapsedMs ?? 0) / 1000);
  const elapsed = `${String(Math.floor(seconds / 60)).padStart(2, '0')}:${String(seconds % 60).padStart(2, '0')}`;
  const label = approvals.length ? uiText(language, '等待授权', 'Awaiting approval') : stopped ? uiText(language, '已停止', 'Stopped') : ({ idle: uiText(language, '就绪', 'Ready'), thinking: uiText(language, '思考中', 'Thinking'), running: uiText(language, '执行中', 'Running'), waiting: uiText(language, '等待中', 'Waiting'), done: uiText(language, '已完成', 'Done'), failed: uiText(language, '运行失败', 'Failed') })[agent.status];
  const eventMessage = (event: TimelineEvent): RemoteChatMessage => ({ id: event.id, role: event.kind === 'thinking' ? 'thinking' : 'tool', title: event.title, text: event.detail, at: event.at, input: event.input, output: event.output, durationMs: event.durationMs, status: event.state === 'error' ? 'error' : event.state === 'interrupted' || (settled && event.state === 'active') ? 'interrupted' : event.state === 'done' ? 'done' : 'streaming' });
  return <section className="remote-process" aria-label={uiText(language, '执行过程', 'Execution activity')}>
    <div className="process-status" role="status"><BrandMark small /><span>{elapsedMs == null ? uiText(language, '耗时未知', 'Duration unknown') : `${settled ? uiText(language, '已工作 ', 'Worked ') : ''}${elapsed}`}</span><span>{label}</span></div>
    {showEvents && agent.timeline.length > 0 && <details className="process-group" open><summary>{uiText(language, '执行过程', 'Activity')}<small>{agent.timeline.filter(event => event.state === 'done').length} {uiText(language, '项操作已完成', 'completed')}</small><IonIcon icon={chevronForwardOutline} /></summary><div className="process-events">{agent.timeline.map(event => <ProcessMessage key={event.id} message={eventMessage(event)} language={language} />)}</div></details>}
    {agent.status === 'failed' && <p className="process-error" role="alert">{agent.detail || uiText(language, '运行未成功结束', 'The run did not finish successfully')}</p>}
    {approvals.map(approval => <button type="button" className="inline-approval" key={approval.id} onClick={() => onApproval(approval.id)}><IonIcon icon={pauseOutline} /><span>{approval.title}</span><span>{uiText(language, '查看', 'Review')}</span></button>)}
  </section>;
}
