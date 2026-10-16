import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { invoke } from '@tauri-apps/api/core';
import { emptyWorkspaceHistory, createConversation, updateConversationMessages, saveWorkspaceHistory, loadWorkspaceHistory, workspaceKey } from './conversation-history';
import type { FilePath } from './types';
vi.mock('@tauri-apps/api/core', () => ({ invoke: vi.fn() }));
const root = 'D:/quota-fixture' as FilePath;
const key = 'trylo:conversation-history:v1:' + workspaceKey(root);
function largeHistory() {
  const c = createConversation(emptyWorkspaceHistory(), { kind: 'code', now: 100 });
  return updateConversationMessages(c.history, c.session.id, [{ id: 'u', role: 'user', kind: 'text', text: 'x'.repeat(600_000), createdAt: 101 }], 101);
}
beforeEach(() => { localStorage.clear(); vi.mocked(invoke).mockReset(); (window as unknown as Record<string, unknown>).__TAURI_INTERNALS__ = {}; });
afterEach(() => { localStorage.clear(); delete (window as unknown as Record<string, unknown>).__TAURI_INTERNALS__; });
it('releases an oversized browser duplicate only after native history save succeeds', async () => {
  const history = largeHistory(); let acknowledge!: () => void;
  vi.mocked(invoke).mockImplementation(() => new Promise<void>(resolve => { acknowledge = resolve; }));
  const saving = saveWorkspaceHistory(root, history);
  expect(localStorage.getItem(key)).toBe(JSON.stringify(history));
  acknowledge(); await saving;
  expect(localStorage.getItem(key)).toBeNull();
  expect(invoke).toHaveBeenCalledWith('conversation_history_save', { workspaceRoot: root, json: JSON.stringify(history) });
});
it('retains the full recovery copy if native persistence fails', async () => {
  const history = largeHistory(); vi.mocked(invoke).mockRejectedValue(new Error('disk unavailable'));
  await expect(saveWorkspaceHistory(root, history)).rejects.toThrow();
  expect(localStorage.getItem(key)).toBe(JSON.stringify(history));
});
it('does not remove a newer crash-recovery snapshot while an older native save is pending', async () => {
  let acknowledge!: () => void;
  vi.mocked(invoke).mockImplementation(() => new Promise<void>(resolve => { acknowledge = resolve; }));
  const saving = saveWorkspaceHistory(root, largeHistory());
  localStorage.setItem(key, 'newer pending snapshot'); acknowledge(); await saving;
  expect(localStorage.getItem(key)).toBe('newer pending snapshot');
});
it('reclaims an existing oversized duplicate on load only when it exactly matches native disk data', async () => {
  const raw = JSON.stringify(largeHistory()); localStorage.setItem(key, raw);
  vi.mocked(invoke).mockResolvedValue(raw);
  await loadWorkspaceHistory(root);
  expect(localStorage.getItem(key)).toBeNull();
  localStorage.setItem(key, raw + ' ');
  await loadWorkspaceHistory(root);
  expect(localStorage.getItem(key)).toBe(raw + ' ');
});
it('keeps browser-only history complete because it is the authoritative copy', async () => {
  delete (window as unknown as Record<string, unknown>).__TAURI_INTERNALS__;
  const history = largeHistory(); await saveWorkspaceHistory(root, history);
  expect(localStorage.getItem(key)).toBe(JSON.stringify(history));
});
