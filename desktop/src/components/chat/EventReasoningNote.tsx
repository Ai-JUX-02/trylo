import { memo } from 'react';
import ReactMarkdown from 'react-markdown';
import type { ThinkingMessage } from './types';

function EventReasoningNoteImpl({ message }: { readonly message: ThinkingMessage }): JSX.Element | null {
  const content = message.preview.trim() || message.summary.trim();
  if (!content) return null;
  const long = content.length > 180 || content.includes('\n');
  return <article className={`code-reasoning__passage code-reasoning__passage--${long ? 'long' : 'short'}`}>
    <span className="code-reasoning__passage-label"><span className="code-reasoning__passage-mark" aria-hidden="true" />{message.partial ? '正在思考' : '思考'}</span>
    <div className="code-reasoning__passage-text"><ReactMarkdown>{content}</ReactMarkdown></div>
  </article>;
}

// Keep historical Markdown stable while another note/tool receives stream deltas.
export const EventReasoningNote = memo(EventReasoningNoteImpl);
EventReasoningNote.displayName = 'EventReasoningNote';
