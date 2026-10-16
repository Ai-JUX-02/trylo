import { useRef, useState } from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import { describe, expect, it } from 'vitest';
import { ModePopover } from './ModePopover';

function Harness() {
  const anchor = useRef<HTMLButtonElement>(null);
  const [open, setOpen] = useState(false);
  return <>
    <button ref={anchor} onClick={() => setOpen(true)}>任务类型</button>
    <button>下一个操作</button>
    {open && <ModePopover current="plan" onSelect={() => {}} onClose={() => setOpen(false)} anchorRef={anchor} />}
  </>;
}

describe('mode menu keyboard continuity', () => {
  it('returns focus to the trigger after choosing a mode', () => {
    render(<Harness />);
    const trigger = screen.getByRole('button', { name: '任务类型' });
    fireEvent.click(trigger);
    fireEvent.click(screen.getByRole('menuitemradio', { name: /对话/ }));
    expect(screen.queryByRole('menu')).toBeNull();
    expect(trigger).toHaveFocus();
  });

  it('Home and End move to the first and last menu choices', () => {
    render(<Harness />);
    fireEvent.click(screen.getByRole('button', { name: '任务类型' }));
    const menu = screen.getByRole('menu');
    fireEvent.keyDown(menu, { key: 'End' });
    expect(screen.getByRole('menuitemradio', { name: /偏好/ })).toHaveFocus();
    fireEvent.keyDown(menu, { key: 'Home' });
    expect(screen.getByRole('menuitemradio', { name: /执行/ })).toHaveFocus();
  });

  it('Tab dismisses the menu and resumes navigation at its trigger', () => {
    render(<Harness />);
    const trigger = screen.getByRole('button', { name: '任务类型' });
    fireEvent.click(trigger);
    fireEvent.keyDown(screen.getByRole('menu'), { key: 'Tab' });
    expect(screen.queryByRole('menu')).toBeNull();
    expect(trigger).toHaveFocus();
  });
});
