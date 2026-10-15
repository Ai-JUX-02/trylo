import { createRef } from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import { describe, expect, it, vi } from 'vitest';
import { CodeReasoningTranscript } from './CodeReasoningTranscript';
import { ModePopover } from './ModePopover';
import { FileChangeCard } from './FileChangeCard';
import type { ThinkingMessage, ToolMessage } from './types';

const think = (id: string, text: string): ThinkingMessage => ({
  id, kind: 'thinking', role: 'assistant', createdAt: 1, turn: 1,
  preview: text, summary: text, fullLength: text.length, partial: false,
});
const edit: ToolMessage = { id: 'edit', kind: 'tool', role: 'assistant', createdAt: 2, tool: 'Edit',
  input: { file_path: 'src/a.ts', old_string: 'const old = 1;', new_string: 'const next = 2;' },
  summary: 'Update a.ts', status: 'done' };

describe('Conversation integration', () => {
  it('keeps completed changes between their surrounding progress summaries', () => {
    const open = vi.fn();
    const { container } = render(<CodeReasoningTranscript active turnId="u1" phaseId="p1"
      entries={[think('first', 'Inspect first'), edit, think('next', 'Verify next')]} onOpenArtifact={open} workspacePath="D:/repo" />);
    const first = screen.getByText('Inspect first');
    const card = screen.getByTestId('file-change-card');
    const next = screen.getByText('Verify next');
    expect(first.compareDocumentPosition(card) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(card.compareDocumentPosition(next) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    fireEvent.click(card.querySelector('button')!);
    expect(container.querySelector('.fchange__diff-line--add')).toHaveTextContent('const next = 2;');
    expect(container.querySelector('.fchange__diff-line--del')).toHaveTextContent('const old = 1;');
    fireEvent.click(screen.getByRole('button', { name: '打开文件' }));
    expect(open).toHaveBeenCalledWith('src/a.ts');
  });
  it('retains a failed edit error alongside the proposed change', () => {
    render(<FileChangeCard message={{ ...edit, status: 'error', outputError: 'old text not found' }} />);
    fireEvent.click(screen.getByTestId('file-change-card').querySelector('button')!);
    expect(screen.getByRole('alert')).toHaveTextContent('old text not found');
    expect(screen.getByText(/修改失败/)).toBeVisible();
  });
  it('switches task kind through its real callback, including keyboard selection', () => {
    const change = vi.fn();
    const close = vi.fn();
    render(<ModePopover current="agent" kind="code" onSelect={vi.fn()} onKindChange={change} onClose={close} anchorRef={createRef()} />);
    const code = screen.getByRole('menuitemradio', { name: 'Code · 编程' });
    fireEvent.keyDown(code, { key: 'ArrowDown' });
    const work = screen.getByRole('menuitemradio', { name: 'Work · 工作' });
    expect(work).toHaveFocus();
    fireEvent.click(work);
    expect(change).toHaveBeenCalledWith('work');
    expect(close).toHaveBeenCalledOnce();
  });
});
