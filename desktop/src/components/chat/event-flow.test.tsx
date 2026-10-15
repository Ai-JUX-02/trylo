import { fireEvent, render } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import { describe, expect, it, vi } from 'vitest';
import { FileChangeCard } from './FileChangeCard';
import { ToolCard } from './ToolCard';
import { EventReasoningNote } from './EventReasoningNote';
import type { ToolMessage } from './types';

const edit: ToolMessage = { id:'edit-1', kind:'tool', role:'assistant', createdAt:1, tool:'Edit', status:'done', summary:'change', input:{file_path:'/repo/src/app.ts',old_string:'same\nold\n',new_string:'same\nnew\nextra\n'} };

describe('event row acceptance', () => {
  it('expands real edit input into numbered red/green rows and opens the actual file', () => {
    const onOpen = vi.fn();
    const view = render(<FileChangeCard variant="event" message={edit} workspacePath="/repo" onOpenFile={onOpen} />);
    const head = view.container.querySelector('.fchange__head')!;
    expect(head).toHaveTextContent('修改');
    expect(head).toHaveTextContent('+2');
    expect(head).toHaveTextContent('−1');
    fireEvent.click(head);
    expect(head).toHaveAttribute('aria-expanded','true');
    const deleted = view.container.querySelector('.fchange__diff-line--del')!;
    expect(deleted).toHaveTextContent('old');
    expect(deleted.querySelector('[aria-label="原片段行号"]')).toHaveTextContent('2');
    expect(deleted.querySelector('[aria-label="新片段行号"]')).toBeEmptyDOMElement();
    fireEvent.click(view.getByText('打开文件'));
    expect(onOpen).toHaveBeenCalledWith('/repo/src/app.ts');
  });

  it('renders failed tool output immediately and lets the user fold it', () => {
    const view = render(<ToolCard variant="event" message={{...edit,tool:'Bash',status:'error',input:{command:'pnpm build'},outputError:'exit code: 1'}} />);
    const head = view.container.querySelector('.tool__head')!;
    expect(head).toHaveAttribute('aria-expanded','true');
    expect(head).toHaveTextContent('执行');
    expect(view.getByText('exit code: 1')).toBeInTheDocument();
    fireEvent.click(head);
    expect(head).toHaveAttribute('aria-expanded','false');
  });

  it('shows the complete reasoning once without a nested disclosure', () => {
    const full = 'Reasoning '.repeat(100);
    const view = render(<EventReasoningNote message={{id:'think-1',kind:'thinking',role:'assistant',createdAt:1,turn:1,summary:'先确认文件，再执行修改。',preview:full,fullLength:full.length,partial:false}} />);
    expect(view.container.querySelector('.code-reasoning__passage-text')?.textContent).toBe(full.trim());
    expect(view.container.querySelector('details')).toBeNull();
    expect(view.container.querySelectorAll('.code-reasoning__passage-text')).toHaveLength(1);
  });

  it('renders original paragraphs, lists and code without turning them into tools or disclosures', () => {
    const full = '先核对状态。\n\n- 保留进程结果\n- 核对窗口\n\n```text\nvisible_window: false\n```\n\n再决定下一步。';
    const view = render(<EventReasoningNote message={{id:'markdown-think',kind:'thinking',role:'assistant',createdAt:1,turn:1,summary:'不要重复展示摘要',preview:full,fullLength:full.length,partial:false}} />);
    expect(view.container.querySelectorAll('li')).toHaveLength(2);
    expect(view.container.querySelector('pre code')).toHaveTextContent('visible_window: false');
    expect(view.container.querySelectorAll('.code-reasoning__passage-text > p')).toHaveLength(2);
    expect(view.queryByText('不要重复展示摘要')).toBeNull();
    expect(view.container.querySelector('button,details,.tool')).toBeNull();
    expect(view.container.querySelector('.code-reasoning__passage-label')).toHaveTextContent(/^思考$/);
  });
});
