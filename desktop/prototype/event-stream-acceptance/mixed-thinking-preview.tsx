import { useId, useState } from 'react';
import { AlertCircle, Ban, ChevronRight, LoaderCircle, Terminal } from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import type { CodeProcessEntry } from '../../src/components/chat/CodeReasoningTranscript';
import type { PreviewProps } from './contrast-preview';
import { ToolCard } from '../../src/components/chat/ToolCard';
import { FileChangeCard } from '../../src/components/chat/FileChangeCard';

// Review-only presentation. Tool rows and their disclosure are production components.
// Preserve the fixture entry order and all reasoning text, including paragraphs.
function Thought({ entry, reading }: { entry: Extract<CodeProcessEntry, { kind: 'thinking' }>; reading: boolean }) {
  const content = entry.preview.trim() || entry.summary.trim();
  const long = content.length > 180 || content.includes('\n');
  return content ? <article className={`mixed-thought${reading ? ` mixed-thought--reading mixed-thought--${long ? 'long' : 'short'}` : ''}`}>
    <span className="mixed-thought__label"><span className="mixed-thought__mark" aria-hidden="true" />{entry.partial ? '正在思考' : '思考'}</span>
    {reading
      ? <div className="mixed-thought__content"><ReactMarkdown>{content}</ReactMarkdown></div>
      : <span className="mixed-thought__content">{content}</span>}
  </article> : null;
}

export function MixedThinkingPreview(props: PreviewProps & { appearance?: 'reading' | 'surface' }) {
  const [expanded, setExpanded] = useState(true);
  const regionId = useId();
  const reading = props.appearance === 'reading';
  const appearanceClass = reading ? ' mixed-thinking-preview--reading' : '';
  if (props.entries.every(entry => entry.kind === 'thinking')) {
    return <section className={`mixed-thinking-preview mixed-thinking-preview--standalone${appearanceClass}`} aria-label="思考全文">
      {props.entries.map(entry => entry.kind === 'thinking' && <Thought entry={entry} reading={reading} key={entry.id} />)}
    </section>;
  }
  const count = props.entries.filter(entry => entry.kind === 'tool').length;
  const failed = props.entries.some(entry => entry.kind === 'tool' && entry.status === 'error');
  const stopped = props.entries.some(entry => entry.kind === 'tool' && entry.status === 'interrupted');
  const Icon = failed ? AlertCircle : stopped ? Ban : props.active ? LoaderCircle : Terminal;
  return <section className={`mixed-thinking-preview code-reasoning${appearanceClass}`} aria-label="执行过程">
    <button type="button" className="code-reasoning__head" aria-expanded={expanded} aria-controls={regionId} onClick={() => setExpanded(value => !value)}>
      <Icon size={15} aria-hidden="true" className={props.active ? 'contrast-preview__spinner' : undefined} />
      <span className="code-reasoning__summary">{props.title}</span>
      <span className="code-reasoning__meta">{count} 次操作</span>
      <ChevronRight size={13} aria-hidden="true" style={{ transform: expanded ? 'rotate(90deg)' : undefined }} />
    </button>
    <div className="code-reasoning__transcript" id={regionId} hidden={!expanded}>
      {props.entries.map(entry => entry.kind === 'thinking'
        ? <Thought key={entry.id} entry={entry} reading={reading} />
        : <div className="code-reasoning__tool" key={entry.id}>{entry.tool === 'Edit'
          ? <FileChangeCard variant="event" message={entry} workspacePath="D:/demo" />
          : <ToolCard variant="event" message={entry} />}</div>)}
    </div>
  </section>;
}
