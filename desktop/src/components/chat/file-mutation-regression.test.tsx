import { fireEvent, render } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import { describe, expect, it } from 'vitest';
import { CodeReasoningTranscript } from './CodeReasoningTranscript';
import type { ToolMessage } from './types';

const tool = (name: string, input: Record<string, unknown>, extra: Partial<ToolMessage> = {}): ToolMessage => ({
  id: 'edit', kind: 'tool', role: 'assistant', createdAt: 1,
  tool: name, input, status: 'done', summary: 'index.html', ...extra,
});
function show(message: ToolMessage) {
  const view = render(<CodeReasoningTranscript active turnId="u" phaseId="p" entries={[message]} />);
  for (const head of view.container.querySelectorAll('.fchange__head')) fireEvent.click(head);
  return view;
}

describe('file mutation presentation regressions', () => {
  it('renders rangeless and ranged unified edit patches instead of a generic output card', () => {
    const view = show(tool('Edit', { path: 'index.html', patch: '@@\n same\n-old\n+new\n@@ -8 +8 @@\n-before\n+after\n' }));
    expect(view.container.querySelectorAll('.fchange')).toHaveLength(1);
    expect(view.container.querySelectorAll('.fchange__diff-line--del')).toHaveLength(2);
    expect(view.container.querySelectorAll('.fchange__diff-line--add')).toHaveLength(2);
    expect(view.container.querySelector('.fchange__stats')).toHaveTextContent('+2');
    expect(view.container.querySelector('.fchange__diff-caption')).toHaveTextContent(/请求|补丁/);
  });
  it('recognizes raw CLI file tool names and notebook cell writes', () => {
    const view = show(tool('notebook_edit', { path: 'notes.ipynb', cell_index: 0, new_source: 'print("hello")' }));
    expect(view.container.querySelector('.fchange')).not.toBeNull();
    expect(view.container.querySelector('.fchange__body')).toHaveTextContent('print("hello")');
    expect(view.container.querySelector('.fchange__stats')).toBeNull();
  });
  it('renders every file in a Codex patch, including moves and deletions with unavailable before content', () => {
    const patch = '*** Begin Patch\n*** Add File: a.txt\n+hello\n*** Update File: b.txt\n*** Move to: c.txt\n@@\n-old\n+new\n*** Delete File: d.txt\n*** End Patch';
    const view = show(tool('apply_patch', { patch }));
    expect(view.container.querySelectorAll('.fchange')).toHaveLength(3);
    expect(view.container.textContent).toContain('a.txt');
    expect(view.container.textContent).toContain('c.txt');
    expect(view.container.textContent).toContain('b.txt');
    expect(view.container.textContent).toContain('d.txt');
    expect(view.container.textContent).toContain('缺少');
  });
  it('does not present an unknown Write overwrite as a new file or invented additions', () => {
    const view = show(tool('Write', { file_path: 'index.html', content: 'new full file\n' }));
    expect(view.container.querySelector('.fchange__stats')).toBeNull();
    expect(view.container.querySelector('.fchange__body')).toHaveTextContent('缺少修改前');
    expect(view.container.querySelector('.fchange__diff-line--add')).toBeNull();
  });
  it('prefers committed result previews and marks truncated statistics as partial', () => {
    const input = { patch: '*** Begin Patch\n*** Update File: a.txt\n@@\n-requested old\n+requested new\n*** End Patch' };
    const view = show(tool('apply_patch', input));
    expect(view.container.querySelector('.fchange__diff-line--del')).toHaveTextContent('requested old');
    const message = tool('apply_patch', input, {
      outputContent: [{ type: 'structured', schema: 'trylo.file-changes.v1', value: [{
        path: 'a.txt', kind: 'patched', preview: '--- a/a.txt\n+++ b/a.txt\n@@ -10 +10 @@\n-actual old\n+actual new\n... [preview truncated: 4 more lines] ...\n', truncated: true,
      }] }],
    });
    view.rerender(<CodeReasoningTranscript active turnId="u" phaseId="p" entries={[message]} />);
    expect(view.container.querySelector('.fchange__diff-line--del')).toHaveTextContent('actual old');
    expect(view.container.querySelector('.fchange__diff-line--add')).toHaveTextContent('actual new');
    expect(view.container.querySelector('.fchange__diff-caption')).toHaveTextContent('部分');
    expect(view.container.querySelector('.fchange__stats')).toHaveTextContent('≥');
  });
  it('keeps failed multi-file requests visibly unconfirmed rather than claiming nothing changed', () => {
    const view = render(<CodeReasoningTranscript active turnId="u" phaseId="p" entries={[tool('apply_patch', {
      patch: '*** Begin Patch\n*** Update File: a.txt\n@@\n-old\n+new\n*** End Patch',
    }, { status: 'error', outputError: 'Applied before failure: M a.txt. Not applied: b.txt.' })]} />);
    expect(view.getByRole('alert')).toHaveTextContent('Applied before failure');
    expect(view.container.querySelector('.fchange__notice')).toHaveTextContent('部分文件');
  });
});
