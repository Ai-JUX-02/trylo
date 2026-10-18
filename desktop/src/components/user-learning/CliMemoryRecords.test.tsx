import { afterEach, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { CliMemoryRecords } from './CliMemoryRecords';
import type { CliMemoryFact } from '../../user-learning/cli-memory';

afterEach(cleanup);
const fact: CliMemoryFact = { id: 'fact-a', version: 3, status: 'active', factKind: 'identity_fact', subject: 'YL Z', statement: '我是 YL Z', createdAt: 1 };

it('edits and retracts the canonical id and version, only after awaiting the command', async () => {
  const change = vi.fn(async () => undefined);
  render(<CliMemoryRecords facts={[fact]} onChange={change} />);
  fireEvent.click(screen.getByRole('button', { name: '修改' }));
  fireEvent.change(screen.getByRole('textbox', { name: '记忆内容' }), { target: { value: '我是 Alex' } });
  fireEvent.click(screen.getByRole('button', { name: '保存修改' }));
  await waitFor(() => expect(change).toHaveBeenCalledWith(fact, '我是 Alex'));
  await waitFor(() => expect(screen.queryByRole('textbox')).toBeNull());
  fireEvent.click(screen.getByRole('button', { name: '撤回' }));
  await waitFor(() => expect(change).toHaveBeenCalledWith(fact, undefined));
});

it('shows update failures instead of claiming the local row was changed', async () => {
  render(<CliMemoryRecords facts={[fact]} onChange={async () => { throw new Error('version_conflict'); }} />);
  fireEvent.click(screen.getByRole('button', { name: '撤回' }));
  expect((await screen.findByRole('alert')).textContent).toContain('version_conflict');
  expect(screen.getByText(fact.statement).isConnected).toBe(true);
});
