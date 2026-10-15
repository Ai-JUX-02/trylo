import { useEffect, useRef, useState } from 'react';
import { CircleAlert, CircleStop, ChevronRight, Layers2, LoaderCircle, MessageSquareText } from 'lucide-react';
import { CodeReasoningTranscript, type CodeProcessEntry } from '../../src/components/chat/CodeReasoningTranscript';
import { EventReasoningNote } from '../../src/components/chat/EventReasoningNote';
import { FileChangeCard } from '../../src/components/chat/FileChangeCard';
import { ToolCard } from '../../src/components/chat/ToolCard';

export interface PreviewProps {
  readonly entries: readonly CodeProcessEntry[];
  readonly title: string;
  readonly active: boolean;
}

// Preview only: unchanged production components render tool rows and reasoning.
// Titles below are explicit fixture facts, not a wired runtime summary feature.
export function ContrastPreview({ entries, title, active }: PreviewProps) {
  const [expanded, setExpanded] = useState(true);
  const tools = entries.filter(entry => entry.kind === 'tool');
  const failed = tools.some(entry => entry.status === 'error');
  const stopped = tools.some(entry => entry.status === 'interrupted');
  const Icon = failed ? CircleAlert : stopped ? CircleStop : active ? LoaderCircle : Layers2;
  return <section className={`contrast-preview${failed ? ' contrast-preview--error' : ''}`} aria-label="执行过程">
    <button type="button" className="contrast-preview__head" aria-expanded={expanded} aria-controls="contrast-process" onClick={() => setExpanded(value => !value)}>
      <Icon size={15} strokeWidth={1.8} className={active ? 'contrast-preview__spinner' : undefined} aria-hidden="true" />
      <span className="contrast-preview__title">{title}</span>
      {tools.length > 0 && <span className="contrast-preview__count">{tools.length} 次操作</span>}
      <ChevronRight size={13} className={expanded ? 'contrast-preview__chevron--open' : undefined} aria-hidden="true" />
    </button>
    <div id="contrast-process" hidden={!expanded} className="code-reasoning__transcript">
      {entries.map(entry => entry.kind === 'thinking'
        ? <div className="contrast-preview__note" key={entry.id}>
          <MessageSquareText className="contrast-preview__note-icon" size={14} strokeWidth={1.7} aria-hidden="true" />
          <EventReasoningNote message={entry} />
        </div>
        : <div className="code-reasoning__tool" key={entry.id}>
          {entry.tool === 'Edit'
            ? <FileChangeCard variant="event" message={entry} workspacePath="D:/demo" />
            : <ToolCard variant="event" message={entry} />}
        </div>)}
    </div>
  </section>;
}

export function IntegratedPreview({ entries, active }: PreviewProps) {
  const root = useRef<HTMLDivElement>(null);
  useEffect(() => {
    // Open the production component for review; its live disclosure stays intact.
    const head = root.current?.querySelector<HTMLButtonElement>('.code-reasoning__head');
    if (head?.getAttribute('aria-expanded') === 'false') head.click();
  }, []);
  return <div ref={root} className="integrated-preview"><CodeReasoningTranscript entries={entries} active={active} turnId="preview-user" phaseId="preview-phase" workspacePath="D:/demo" /></div>;
}
