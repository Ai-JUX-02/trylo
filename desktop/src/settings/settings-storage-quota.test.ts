import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { connectionFields, loadSettings, saveSettings, settingsDefaults } from './settings-store';
const primary = 'trylo:settings:v1';
const backup = primary + ':backup';
const old = { ...settingsDefaults, apiFormat: 'anthropic' as const };
const next = { ...old, apiFormat: 'openai' as const, apiKey: 'test-only-'.repeat(150) };
beforeEach(() => { localStorage.clear(); saveSettings(old); saveSettings(old); });
afterEach(() => { vi.restoreAllMocks(); localStorage.clear(); });
function fillQuota() {
  let used = 0;
  for (let i = 0; i < localStorage.length; i++) { const k = localStorage.key(i)!; used += k.length + localStorage.getItem(k)!.length; }
  const filler = 'x'.repeat(5_000_000 - used - 'history-fixture'.length - 100);
  localStorage.setItem('history-fixture', filler);
  return filler;
}
it('saves OpenAI at the real jsdom storage quota by reclaiming only its redundant settings backup', () => {
  const filler = fillQuota();
  expect(() => localStorage.setItem(primary, JSON.stringify(next))).toThrow();
  saveSettings(next);
  expect(connectionFields(loadSettings())).toEqual(connectionFields(next));
  expect(localStorage.getItem('history-fixture')).toBe(filler);
});
it('restores the backup and keeps the previous primary if retry still exceeds quota', () => {
  fillQuota();
  const before = localStorage.getItem(backup);
  expect(() => saveSettings({ ...next, apiKey: 'x'.repeat(20_000) })).toThrow(/QuotaExceededError/);
  expect(localStorage.getItem(backup)).toBe(before);
  expect(loadSettings().apiFormat).toBe('anthropic');
});
it('never reclaims the only valid settings copy when the primary is malformed', () => {
  localStorage.setItem(primary, '{broken');
  fillQuota();
  const before = localStorage.getItem(backup);
  expect(() => saveSettings(next)).toThrow();
  expect(localStorage.getItem(backup)).toBe(before);
  expect(loadSettings().apiFormat).toBe('anthropic');
});
it('reports denied storage separately and never deletes backup data', () => {
  const before = localStorage.getItem(backup);
  vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new DOMException('denied', 'SecurityError'); });
  expect(() => saveSettings(next)).toThrow(/SecurityError/);
  expect(localStorage.getItem(backup)).toBe(before);
});
