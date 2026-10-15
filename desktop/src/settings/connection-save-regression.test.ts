import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { connectionFields, loadSettings, saveSettings, settingsDefaults, type TryloSettings } from './settings-store';
import { conversationModelsAfterSettingsSave, settingsForConversation, setConversationChoice } from './conversation-models';

const legacyProfile = { id: 'old', name: 'Old connection', ...connectionFields(settingsDefaults),
  apiFormat: 'anthropic' as const, apiHost: 'https://old.invalid', apiModel: 'old-model', providerId: 'old-provider' };
const previous: TryloSettings = { ...settingsDefaults, ...connectionFields(legacyProfile), modelProfiles: [legacyProfile], activeModelProfileId: legacyProfile.id };
const edited: TryloSettings = { ...previous, apiFormat: 'openai', apiHost: 'https://new.invalid/v1', apiModel: 'new-model', providerId: 'openai-compatible', apiKey: 'test-only-new-key' };

beforeEach(() => { window.localStorage.clear(); });
afterEach(() => { vi.restoreAllMocks(); window.localStorage.clear(); });

it('a conversation profile never mutates the global connection handed to React state', () => {
  const map = setConversationChoice({}, 'ws', 'active', { kind: 'profile', id: 'old' });
  const stored = { ...edited };
  const stateObject = stored;
  const run = settingsForConversation(stored, 'ws', 'active', map);
  expect(run.apiFormat).toBe('anthropic');
  expect(stateObject).toEqual(edited);
  expect(run).not.toBe(stateObject);
});

it.each(['code', 'work', 'edit-and-resend'])('saving OpenAI survives %s send, reread and an unrelated settings save', () => {
  let map = setConversationChoice({}, 'ws', 'active', { kind: 'profile', id: 'old' });
  map = setConversationChoice(map, 'ws', 'other', { kind: 'profile', id: 'old' });
  saveSettings(previous);
  saveSettings(edited);
  map = conversationModelsAfterSettingsSave(previous, edited, map, 'ws', 'active');
  const displayed = loadSettings();
  const run = settingsForConversation(displayed, 'ws', 'active', map);
  expect(connectionFields(run)).toEqual(connectionFields(edited));
  expect(connectionFields(displayed)).toEqual(connectionFields(edited));
  saveSettings({ ...displayed, remote: { ...displayed.remote, enabled: true } });
  expect(connectionFields(loadSettings())).toEqual(connectionFields(edited));
  expect(settingsForConversation(loadSettings(), 'ws', 'other', map).apiFormat).toBe('anthropic');
});

it('an optional backup write failure cannot prevent the primary OpenAI save', () => {
  saveSettings(previous);
  const original = Storage.prototype.setItem;
  vi.spyOn(Storage.prototype, 'setItem').mockImplementation(function (this: Storage, key, value) {
    if (key.includes('backup')) throw new DOMException('quota', 'QuotaExceededError');
    original.call(this, key, value);
  });
  saveSettings(edited);
  expect(connectionFields(loadSettings())).toEqual(connectionFields(edited));
});

it('a primary storage failure is reported instead of claiming the configuration was saved', () => {
  saveSettings(previous);
  vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new DOMException('quota', 'QuotaExceededError'); });
  expect(() => saveSettings(edited)).toThrow();
  expect(loadSettings().apiFormat).toBe('anthropic');
});

it('explicitly saving the connection applies already-saved OpenAI settings over an older conversation choice', () => {
  const map = setConversationChoice({}, 'ws', 'active', { kind: 'profile', id: 'old' });
  const nextMap = conversationModelsAfterSettingsSave(edited, edited, map, 'ws', 'active', 'connection');
  expect(connectionFields(settingsForConversation(edited, 'ws', 'active', nextMap))).toEqual(connectionFields(edited));
});
