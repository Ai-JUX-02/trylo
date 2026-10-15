import { useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { CodeReasoningTranscript } from '../../src/components/chat/CodeReasoningTranscript';
import type { ThinkingMessage, ToolMessage } from '../../src/components/chat/types';
import '../../src/styles/tokens.css';
import '../../src/styles/base.css';
import '../../src/styles/components/disclosure.css';
import '../../src/styles/components/message.css';
import '../../src/styles/components/tool-card.css';
import '../../src/styles/components/file-change-card.css';
import '../../src/styles/components/code-reasoning-transcript.css';
import '../../src/styles/components/event-flow.css';
import './hierarchy.css';

// Explicit sample content. Both views consume this same ordered list; no reordering.
const thought = (id: string, text: string): ThinkingMessage => ({ id, kind: 'thinking', role: 'assistant', createdAt: 100, turn: 1, summary: text, preview: text, fullLength: text.length, partial: false });
const tool = (id: string, description: string, command: string): ToolMessage => ({ id, toolCallId: id, kind: 'tool', role: 'assistant', createdAt: 100, tool: 'Bash', input: { description, command }, summary: command, status: 'done', outputText: '示例返回：已完成检查。', durationMs: 900 });
type Entry = { kind: 'narration'; id: string; text: string } | ThinkingMessage | ToolMessage;
const entries: Entry[] = [
  { kind: 'narration', id: 'n1', text: '修复 3 个小问题：加宽 KPI 卡片列、加高说明页备注行。' },
  tool('t1', 'Fix KPI column widths and readme row heights', 'officecli set dashboard.xlsx --sheet 看板 --range B:N --column-width 16'),
  thought('r1', '列宽和备注行已调整。接下来检查实际显示效果，确认标题、数值和单位都没有被截断。'),
  { kind: 'narration', id: 'n2', text: '问题清零。视觉审视各工作表：' },
  tool('t2', 'Check dashboard rendering', 'officecli render dashboard.xlsx --sheet 看板'),
  thought('r2', 'K7 shows "呼和浩特 · 最冷" but K is the AQI card (sub should be PM2.5 均值). Check row 5/6 labels to see the real mapping.\n\n先核对标签行和卡片位置，再修正映射，避免只改文字却把数值放错。'),
  { kind: 'narration', id: 'n3', text: '查一下 KPI 卡的标签行，确认列对应关系：' },
  tool('t3', 'Check KPI card labels and values', 'officecli view dashboard.xlsx --sheet 看板 --range B5:N7'),
  thought('r3', '确认对应关系后，再检查其他工作表的内容。'),
];
const streamText = '逐项核对卡片的位置、标签和数值。先确认列映射，再检查标题有没有截断；如果发现问题，就只调整对应位置，随后重新查看渲染结果。';

function HierarchyPreview() {
  const [original, setOriginal] = useState(false);
  const [dark, setDark] = useState(false);
  const [streamLength, setStreamLength] = useState<number | null>(null);
  useEffect(() => { document.documentElement.dataset.theme = dark ? 'dark' : 'light'; }, [dark]);
  useEffect(() => {
    if (streamLength === null || streamLength >= streamText.length) return;
    const timer = window.setTimeout(() => setStreamLength(value => value === null ? null : Math.min(value + 2, streamText.length)), 55);
    return () => window.clearTimeout(timer);
  }, [streamLength]);
  return <main className={`hierarchy-preview ${original ? 'hierarchy-preview--original' : ''}`}>
    <header className="hierarchy-toolbar">
      <strong>事件流预览</strong>
      <div role="group" aria-label="预览版本">
        <button aria-pressed={!original} onClick={() => setOriginal(false)}>新版层级</button>
        <button aria-pressed={original} onClick={() => setOriginal(true)}>当前版对照</button>
      </div>
      <button onClick={() => { setOriginal(false); setStreamLength(0); }}>重播思考增量</button>
      <button onClick={() => setDark(value => !value)}>{dark ? '浅色' : '深色'}</button>
      <span>独立预览 · 示例内容</span>
    </header>
    <div className="hierarchy-chat">
      <div className="hierarchy-user">检查天气看板的排版和 KPI 对应关系。</div>
      <div className="hierarchy-flow">
        {entries.map(entry => entry.kind === 'narration'
          ? <p className="hierarchy-narration" key={entry.id}>{entry.text}</p>
          : entry.kind === 'thinking' && !original
            ? <section className="hierarchy-thought" aria-label="思考" key={entry.id}>
                <h2>思考</h2><p>{entry.preview}</p>
              </section>
            : <CodeReasoningTranscript key={entry.id} entries={[entry]} active={false} turnId="hierarchy-demo" phaseId={entry.id} />)}
        {streamLength !== null && <section className="hierarchy-thought" aria-label="增量思考示例" aria-busy={streamLength < streamText.length}>
          <h2>{streamLength < streamText.length ? '正在思考' : '思考'}</h2>
          <p>{streamText.slice(0, streamLength)}{streamLength < streamText.length && <span className="hierarchy-caret" aria-hidden="true" />}</p>
        </section>}
      </div>
      <footer className="hierarchy-footer">仅演示视觉层级与增量显示，不执行工具。</footer>
    </div>
  </main>;
}
createRoot(document.getElementById('root')!).render(<HierarchyPreview />);
