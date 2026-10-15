import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi, type Mock } from 'vitest';
import { ModelSelector } from './ModelSelector';

function setup(): {
  onSelectConfigured: Mock;
  onSelectPool: Mock;
  onSelectProfile: Mock;
} {
  const onSelectConfigured = vi.fn();
  const onSelectPool = vi.fn();
  const onSelectProfile = vi.fn();
  render(
    <ModelSelector
      configuredModel="own-model"
      poolModel=""
      onSelectConfigured={onSelectConfigured}
      onSelectPool={onSelectPool}
      onSelectProfile={onSelectProfile}
    />,
  );
  return { onSelectConfigured, onSelectPool, onSelectProfile };
}

function openPopover(): HTMLElement {
  fireEvent.click(screen.getByRole('button', { name: /^Model:/ }));
  return screen.getByRole('listbox', { name: 'Select model' });
}

describe('ModelSelector keyboard selection', () => {
  it('Enter picks the arrow-focused row, not the row current at open time', () => {
    const { onSelectPool, onSelectConfigured } = setup();
    openPopover();
    // Focus starts on the own-model row; one ArrowDown lands on the pool row.
    fireEvent.keyDown(document, { key: 'ArrowDown' });
    fireEvent.keyDown(document, { key: 'Enter' });
    expect(onSelectPool).toHaveBeenCalledWith('grok-4.5');
    expect(onSelectConfigured).not.toHaveBeenCalled();
  });

  it('Escape closes the popover and disarms Enter', () => {
    const { onSelectConfigured } = setup();
    openPopover();
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(screen.queryByRole('listbox', { name: 'Select model' })).toBeNull();
    fireEvent.keyDown(document, { key: 'Enter' });
    expect(onSelectConfigured).not.toHaveBeenCalled();
  });
});

describe('ModelSelector grouped list', () => {
  it('renders both group headings with the pool below a divider', () => {
    setup();
    const list = openPopover();
    expect(screen.getByText('我的配置')).toBeTruthy();
    expect(screen.getByText('免费算力池')).toBeTruthy();
    const headings = Array.from(list.querySelectorAll('.model-selector__group-heading')).map(
      (n) => n.textContent,
    );
    expect(headings).toEqual(['我的配置', '免费算力池']);
    expect(list.querySelector('.model-selector__divider')).toBeTruthy();
  });

  it('marks exactly the active row as selected', () => {
    render(
      <ModelSelector
        configuredModel="own-model"
        poolModel="grok-4.5"
        onSelectConfigured={vi.fn()}
        onSelectPool={vi.fn()}
      />,
    );
    openPopover();
    const selected = screen
      .getAllByRole('option')
      .filter((o) => o.getAttribute('aria-selected') === 'true');
    expect(selected).toHaveLength(1);
    expect(selected[0]!.textContent).toContain('Grok 4.5');
  });

  it('clicking a row selects it and closes the popover', () => {
    const { onSelectPool } = setup();
    openPopover();
    fireEvent.click(screen.getByText('Grok 4.5'));
    expect(onSelectPool).toHaveBeenCalledWith('grok-4.5');
    expect(screen.queryByRole('listbox', { name: 'Select model' })).toBeNull();
  });
});
