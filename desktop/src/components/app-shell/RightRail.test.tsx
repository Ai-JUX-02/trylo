import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { FilePath } from '../../host-adapter/types';
import { RightRail } from './RightRail';

vi.mock('./WorkspaceTree', () => ({
  WorkspaceTree: (props: { onSelect?: (path: FilePath, kind: 'file') => void }) =>
    <button onClick={() => props.onSelect?.('project/result.txt' as FilePath, 'file')}>result.txt</button>,
}));

describe('Shared results rail', () => {
  it('opens the real file selection in Preview and allows returning to Files', () => {
    const select = vi.fn();
    const { rerender } = render(<RightRail open root={'project' as FilePath} onClose={() => {}} onSelectFile={select} />);
    fireEvent.click(screen.getByRole('button', { name: 'result.txt' }));
    expect(select).toHaveBeenCalledWith('project/result.txt', 'file');
    rerender(<RightRail open root={'project' as FilePath} onClose={() => {}} onSelectFile={select}
      preview={<div>Actual preview content</div>} previewKey="file:result.txt" />);
    expect(screen.getByRole('tabpanel', { name: '预览' }).textContent).toContain('Actual preview content');
    expect(screen.queryByRole('tabpanel', { name: '文件' })).toBeNull();
    fireEvent.click(screen.getByRole('tab', { name: '文件' }));
    expect(screen.getByRole('button', { name: 'result.txt' })).toBeTruthy();
    expect(screen.queryByRole('tabpanel', { name: '预览' })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'result.txt' }));
    expect(screen.getByRole('tabpanel', { name: '预览' }).textContent).toContain('Actual preview content');
  });
  it('opens a newly requested result while Files is selected without adding another rail', () => {
    const { rerender } = render(<RightRail open root={'project' as FilePath} onClose={() => {}}
      preview={<div>First result</div>} previewKey="diff:first" />);
    fireEvent.click(screen.getByRole('tab', { name: '文件' }));
    rerender(<RightRail open root={'project' as FilePath} onClose={() => {}}
      preview={<div>Second result</div>} previewKey="diff:second" />);
    expect(screen.getByRole('tabpanel', { name: '预览' }).textContent).toContain('Second result');
    expect(screen.getAllByRole('complementary', { name: 'Workspace files' })).toHaveLength(1);
  });
});
