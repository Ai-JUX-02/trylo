import { fireEvent, render, screen } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import { describe, expect, it, vi } from 'vitest';
import { TopBar } from './TopBar';

describe('Conversation header', () => {
  it('shows the selected workspace and conversation, and reopens the sidebar', () => {
    const toggle = vi.fn();
    render(<TopBar workspaceName="Project A" conversationTitle="Fix import" collapsed onToggleLeftRail={toggle} />);
    expect(screen.getByText('Project A')).toBeVisible();
    expect(screen.getByText('Fix import')).toBeVisible();
    fireEvent.click(screen.getByRole('button', { name: 'Expand rail' }));
    expect(toggle).toHaveBeenCalledOnce();
  });
  it('retains actual host actions and the collaboration surface', () => {
    const files = vi.fn();
    render(<TopBar workspaceName="Project B" collapsed={false} onToggleLeftRail={vi.fn()}
      collaborationSwitch={<span>Team</span>} right={<button onClick={files}>Files</button>} />);
    expect(screen.getByText('Team')).toBeVisible();
    expect(screen.getByRole('button', { name: 'Files' })).toBeVisible();
    fireEvent.click(screen.getByRole('button', { name: 'Files' }));
    expect(files).toHaveBeenCalledOnce();
  });
});
